import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  fetchWC2026Matches,
  fetchWC2026Standings,
  tlaToCode,
  getBest8ThirdPlace,
  KNOCKOUT_STAGE_TO_NEXT_ROUND,
  type FDMatch,
} from "@/lib/football-data";

// 72 matchs de poules (12 groupes × 6 matchs)
const GROUP_STAGE_TOTAL = 72;

// Un match peut durer jusqu'à 120 min (prolongations) + ~15 min de tirs au but.
// On considère qu'un match est potentiellement terminé 110 min après le coup d'envoi.
const MATCH_DURATION_MINUTES = 110;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.FOOTBALL_DATA_API_KEY) {
    return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY manquant" }, { status: 500 });
  }

  const admin = createAdminClient();
  const now   = new Date();
  const nowIso = now.toISOString();

  // ── Étape 1 : y a-t-il des matchs à traiter ? ────────────────────────────
  // On cherche les matchs dont le coup d'envoi est passé depuis au moins
  // MATCH_DURATION_MINUTES et qui ne sont pas encore marqués FINISHED dans notre DB.
  const threshold = new Date(now.getTime() - MATCH_DURATION_MINUTES * 60_000).toISOString();

  const { data: pending } = await admin
    .from("wc2026_matches")
    .select("fd_id, stage, group_name, home_tla, away_tla")
    .lt("kickoff_utc", threshold)
    .neq("status", "FINISHED")
    .order("kickoff_utc", { ascending: true });

  if (!pending?.length) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Aucun match en attente de résultat.",
    });
  }

  const log: string[] = [`${pending.length} match(s) à traiter`];

  try {
    // ── Étape 2 : récupérer les résultats depuis l'API ────────────────────
    const apiMatches = await fetchWC2026Matches();
    const byId = new Map<number, FDMatch>(apiMatches.map((m) => [m.id, m]));

    let groupFinishedCount = 0;
    let newlyFinishedKnockout: FDMatch[] = [];

    for (const row of pending) {
      const m = byId.get(row.fd_id);
      if (!m) { log.push(`⚠ Match ${row.fd_id} absent de l'API`); continue; }

      if (m.status !== "FINISHED") {
        log.push(`⏳ Match ${row.fd_id} toujours en cours (${m.status})`);
        continue;
      }

      // Mettre à jour wc2026_matches
      await admin.from("wc2026_matches").update({
        home_tla:      m.homeTeam?.tla || null,
        away_tla:      m.awayTeam?.tla || null,
        home_score:    m.score.fullTime.home ?? null,
        away_score:    m.score.fullTime.away ?? null,
        penalties_home: m.score.penalties?.home ?? null,
        penalties_away: m.score.penalties?.away ?? null,
        winner:        m.score.winner ?? null,
        status:        "FINISHED",
        synced_at:     nowIso,
      }).eq("fd_id", m.id);

      if (m.stage === "GROUP_STAGE") {
        log.push(`✓ Poules — ${m.homeTeam.tla} ${m.score.fullTime.home}-${m.score.fullTime.away} ${m.awayTeam.tla}`);
      } else if (KNOCKOUT_STAGE_TO_NEXT_ROUND[m.stage]) {
        newlyFinishedKnockout.push(m);
      }
    }

    // ── Étape 3 : traitements knockout ────────────────────────────────────
    for (const m of newlyFinishedKnockout) {
      const nextRound = KNOCKOUT_STAGE_TO_NEXT_ROUND[m.stage];
      if (!m.score.winner || m.score.winner === "DRAW") {
        log.push(`⚠ Knockout ${m.id} sans vainqueur clair (${m.score.winner})`);
        continue;
      }

      const winnerTla = m.score.winner === "HOME_TEAM" ? m.homeTeam.tla : m.awayTeam.tla;
      const loserTla  = m.score.winner === "HOME_TEAM" ? m.awayTeam.tla : m.homeTeam.tla;
      const winnerCode = tlaToCode(winnerTla);
      const loserCode  = tlaToCode(loserTla);

      if (!winnerCode) log.push(`⚠ TLA inconnu: ${winnerTla}`);
      if (!loserCode)  log.push(`⚠ TLA inconnu: ${loserTla}`);

      if (winnerCode) {
        const { error } = await admin.from("teams")
          .update({ round_reached: nextRound, round_advanced_at: nowIso })
          .eq("country_code", winnerCode)
          .eq("round_reached", currentRoundForStage(m.stage));
        if (!error) log.push(`✓ ${winnerTla} → ${nextRound}`);
      }
      if (loserCode) {
        const { error } = await admin.from("teams")
          .update({ is_active: false, eliminated_at: nowIso })
          .eq("country_code", loserCode)
          .eq("is_active", true);
        if (!error) log.push(`✗ ${loserTla} éliminé`);
      }
    }

    // ── Étape 4 : fin de phase de groupes ? ───────────────────────────────
    const { count } = await admin
      .from("wc2026_matches")
      .select("fd_id", { count: "exact", head: true })
      .eq("stage", "GROUP_STAGE")
      .eq("status", "FINISHED");

    if ((count ?? 0) >= GROUP_STAGE_TOTAL) {
      log.push("Phase de groupes terminée — calcul des qualifiés");
      await processGroupStageQualification(admin, nowIso, log);
    }

    return NextResponse.json({ ok: true, synced_at: nowIso, log });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync-wc2026]", message);
    return NextResponse.json({ ok: false, error: message, log }, { status: 500 });
  }
}

// ── Qualification phase de groupes ───────────────────────────────────────────
async function processGroupStageQualification(
  admin: ReturnType<typeof createAdminClient>,
  now: string,
  log: string[]
) {
  // Vérifie si c'est déjà traité (au moins un team en round_of_32)
  const { count: alreadyDone } = await admin
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("round_reached", "round_of_32");
  if ((alreadyDone ?? 0) > 0) {
    log.push("Qualification groupes déjà traitée — skip");
    return;
  }

  const standings = await fetchWC2026Standings();

  const top2Tlas: string[] = [];
  for (const group of standings.filter((s) => s.stage === "GROUP_STAGE")) {
    top2Tlas.push(...group.table.filter((r) => r.position <= 2).map((r) => r.team.tla));
  }

  const best8Tlas = getBest8ThirdPlace(standings);

  const allThirdsTlas = standings
    .filter((s) => s.stage === "GROUP_STAGE")
    .map((g) => g.table.find((r) => r.position === 3)?.team.tla)
    .filter(Boolean) as string[];
  const allFourthsTlas = standings
    .filter((s) => s.stage === "GROUP_STAGE")
    .map((g) => g.table.find((r) => r.position === 4)?.team.tla)
    .filter(Boolean) as string[];

  const eliminated = [
    ...allThirdsTlas.filter((tla) => !best8Tlas.includes(tla)),
    ...allFourthsTlas,
  ];

  for (const tla of [...top2Tlas, ...best8Tlas]) {
    const code = tlaToCode(tla);
    if (!code) { log.push(`⚠ TLA inconnu (qualifié): ${tla}`); continue; }
    await admin.from("teams")
      .update({ round_reached: "round_of_32", round_advanced_at: now })
      .eq("country_code", code)
      .eq("round_reached", "group_stage");
    log.push(`✓ ${tla} → round_of_32`);
  }

  for (const tla of eliminated) {
    const code = tlaToCode(tla);
    if (!code) { log.push(`⚠ TLA inconnu (éliminé): ${tla}`); continue; }
    await admin.from("teams")
      .update({ is_active: false, eliminated_at: now })
      .eq("country_code", code)
      .eq("is_active", true);
    log.push(`✗ ${tla} éliminé (groupes)`);
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function currentRoundForStage(stage: string): string {
  const map: Record<string, string> = {
    ROUND_OF_32:    "round_of_32",
    ROUND_OF_16:    "round_of_16",
    QUARTER_FINALS: "quarter_final",
    SEMI_FINALS:    "semi_final",
    FINAL:          "final",
  };
  return map[stage] ?? "";
}
