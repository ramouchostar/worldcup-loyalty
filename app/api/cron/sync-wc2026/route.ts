import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  fetchWC2026Teams,
  fetchWC2026Matches,
  fetchWC2026Standings,
  tlaToCode,
  getBest8ThirdPlace,
  KNOCKOUT_STAGE_TO_NEXT_ROUND,
  type FDMatch,
  type FDTeam,
} from "@/lib/football-data";

// WC2026 : 12 groupes × 6 matchs = 72 matchs de poules au total
const GROUP_STAGE_TOTAL_MATCHES = 72;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.FOOTBALL_DATA_API_KEY) {
    return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY manquant" }, { status: 500 });
  }

  const admin = createAdminClient();
  const now   = new Date().toISOString();
  const log: string[] = [];

  try {
    // ── Étape 0 : synchro de la liste des équipes qualifiées ─────────────────
    // L'API est la source de vérité — elle sait exactement quelles 48 équipes
    // ont qualifié. On ne hardcode rien.
    const apiTeams = await fetchWC2026Teams();
    log.push(`API retourne ${apiTeams.length} équipes qualifiées`);
    await syncQualifiedTeams(admin, apiTeams, now, log);

    // ── Étape 1 : phases knockout ────────────────────────────────────────────
    const matches = await fetchWC2026Matches();
    const finishedMatches = matches.filter(m => m.status === "FINISHED");

    const knockoutStages = Object.keys(KNOCKOUT_STAGE_TO_NEXT_ROUND);
    const knockoutFinished = finishedMatches.filter(m => knockoutStages.includes(m.stage));

    for (const match of knockoutFinished) {
      const result = processKnockoutMatch(match);
      if (!result) continue;

      const { winnerTla, loserTla, nextRound } = result;
      const winnerCode = tlaToCode(winnerTla);
      const loserCode  = tlaToCode(loserTla);

      if (!winnerCode) { log.push(`⚠ TLA inconnu (winner): ${winnerTla}`); }
      if (!loserCode)  { log.push(`⚠ TLA inconnu (loser): ${loserTla}`); }

      if (winnerCode) {
        const { error } = await admin
          .from("teams")
          .update({ round_reached: nextRound, round_advanced_at: now })
          .eq("country_code", winnerCode)
          .eq("round_reached", currentRoundForStage(match.stage));
        if (!error) log.push(`✓ ${winnerTla} → ${nextRound}`);
      }

      if (loserCode) {
        const { error } = await admin
          .from("teams")
          .update({ is_active: false, eliminated_at: now })
          .eq("country_code", loserCode)
          .eq("is_active", true);
        if (!error) log.push(`✗ ${loserTla} éliminé (knockout)`);
      }
    }

    // ── Étape 2 : fin de phase de groupes ────────────────────────────────────
    const groupFinished = finishedMatches.filter(m => m.stage === "GROUP_STAGE");

    if (groupFinished.length >= GROUP_STAGE_TOTAL_MATCHES) {
      log.push("Phase de groupes terminée — calcul des qualifiés");
      const standings = await fetchWC2026Standings();

      const top2Tlas: string[] = [];
      for (const group of standings.filter(s => s.stage === "GROUP_STAGE")) {
        top2Tlas.push(...group.table.filter(r => r.position <= 2).map(r => r.team.tla));
      }

      const best8Tlas = getBest8ThirdPlace(standings);

      const allThirdsTlas = standings
        .filter(s => s.stage === "GROUP_STAGE")
        .map(g => g.table.find(r => r.position === 3)?.team.tla)
        .filter(Boolean) as string[];
      const allFourthsTlas = standings
        .filter(s => s.stage === "GROUP_STAGE")
        .map(g => g.table.find(r => r.position === 4)?.team.tla)
        .filter(Boolean) as string[];

      const eliminatedGroupTlas = [
        ...allThirdsTlas.filter(tla => !best8Tlas.includes(tla)),
        ...allFourthsTlas,
      ];

      for (const tla of [...top2Tlas, ...best8Tlas]) {
        const code = tlaToCode(tla);
        if (!code) { log.push(`⚠ TLA inconnu (qualifié groupes): ${tla}`); continue; }
        await admin.from("teams")
          .update({ round_reached: "round_of_32", round_advanced_at: now })
          .eq("country_code", code)
          .eq("round_reached", "group_stage");
        log.push(`✓ ${tla} → round_of_32`);
      }

      for (const tla of eliminatedGroupTlas) {
        const code = tlaToCode(tla);
        if (!code) { log.push(`⚠ TLA inconnu (éliminé groupes): ${tla}`); continue; }
        await admin.from("teams")
          .update({ is_active: false, eliminated_at: now })
          .eq("country_code", code)
          .eq("is_active", true);
        log.push(`✗ ${tla} éliminé (groupes)`);
      }
    }

    return NextResponse.json({
      ok: true,
      synced_at: now,
      finished_matches: finishedMatches.length,
      log,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync-wc2026]", message);
    return NextResponse.json({ ok: false, error: message, log }, { status: 500 });
  }
}

// ── Synchro de la liste des équipes qualifiées ───────────────────────────────
// Source de vérité : football-data.org /competitions/WC/teams
// - Équipes dans l'API → is_active = true (elles ont qualifié)
// - Équipes dans notre DB mais absentes de l'API → is_active = false (non-qualifiées)
// - Équipes dans l'API mais absentes de notre DB → INSERT automatique
async function syncQualifiedTeams(
  admin: ReturnType<typeof createAdminClient>,
  apiTeams: FDTeam[],
  now: string,
  log: string[]
) {
  const qualifiedTlas = new Set(apiTeams.map(t => t.tla));

  // Récupère toutes nos équipes
  const { data: dbTeams } = await admin.from("teams").select("id, name, country_code, is_active");
  if (!dbTeams) return;

  // Map country_code → id pour les lookups
  const dbByCode = new Map(dbTeams.map(t => [t.country_code, t]));

  // Équipes de l'API → marquer actives si elles ne le sont pas déjà
  for (const apiTeam of apiTeams) {
    const code = tlaToCode(apiTeam.tla);
    if (!code) {
      log.push(`⚠ TLA sans mapping country_code: ${apiTeam.tla} (${apiTeam.name}) — à ajouter dans TLA_TO_COUNTRY_CODE`);
      continue;
    }

    const dbTeam = dbByCode.get(code);

    if (!dbTeam) {
      // Équipe qualifiée mais absente de notre DB → INSERT
      const { error } = await admin.from("teams").insert({
        name: apiTeam.shortName || apiTeam.name,
        flag_emoji: "🏳️", // placeholder — à corriger via admin/teams
        country_code: code,
        is_active: true,
      });
      if (!error) {
        log.push(`+ ${apiTeam.tla} (${apiTeam.name}) inséré — mettre à jour le flag_emoji via admin`);
        // INSERT community_scores pour ce nouveau team
        const { data: newTeam } = await admin.from("teams").select("id").eq("country_code", code).single();
        if (newTeam) {
          const { data: restaurants } = await admin
            .from("community_scores")
            .select("restaurant_id")
            .limit(1);
          const restaurantId = (restaurants?.[0] as { restaurant_id: string } | undefined)?.restaurant_id;
          if (restaurantId) {
            await admin.from("community_scores").insert({
              team_id: newTeam.id,
              restaurant_id: restaurantId,
              member_count: 0,
              total_spent: 0,
            });
          }
        }
      }
    } else if (!dbTeam.is_active) {
      // Équipe dans l'API mais marquée inactive dans notre DB → réactiver
      await admin.from("teams")
        .update({ is_active: true, eliminated_at: null })
        .eq("id", dbTeam.id);
      log.push(`↑ ${apiTeam.tla} réactivé (présent dans l'API WC2026)`);
    }
  }

  // Équipes de notre DB absentes de l'API → non-qualifiées → marquer inactives
  for (const dbTeam of dbTeams) {
    const tla = Object.entries(
      (await import("@/lib/football-data")).TLA_TO_COUNTRY_CODE
    ).find(([, code]) => code === dbTeam.country_code)?.[0];

    if (!tla) continue; // pas dans notre mapping → ignorer (équipe test etc.)
    if (!qualifiedTlas.has(tla) && dbTeam.is_active) {
      await admin.from("teams")
        .update({ is_active: false, eliminated_at: now })
        .eq("id", dbTeam.id);
      log.push(`✗ ${tla} (${dbTeam.name}) → non-qualifié selon l'API`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function processKnockoutMatch(match: FDMatch): {
  winnerTla: string; loserTla: string; nextRound: string;
} | null {
  const { score, homeTeam, awayTeam, stage } = match;
  const nextRound = KNOCKOUT_STAGE_TO_NEXT_ROUND[stage];
  if (!nextRound) return null;
  if (!score.winner || score.winner === "DRAW") return null;
  const winnerTla = score.winner === "HOME_TEAM" ? homeTeam.tla : awayTeam.tla;
  const loserTla  = score.winner === "HOME_TEAM" ? awayTeam.tla : homeTeam.tla;
  return { winnerTla, loserTla, nextRound };
}

function currentRoundForStage(stage: string): string {
  const map: Record<string, string> = {
    'ROUND_OF_32':    'round_of_32',
    'ROUND_OF_16':    'round_of_16',
    'QUARTER_FINALS': 'quarter_final',
    'SEMI_FINALS':    'semi_final',
    'FINAL':          'final',
  };
  return map[stage] ?? '';
}
