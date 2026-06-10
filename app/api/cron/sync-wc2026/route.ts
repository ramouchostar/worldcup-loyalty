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

// WC2026 : 12 groupes × 6 matchs = 72 matchs de poules au total
const GROUP_STAGE_TOTAL_MATCHES = 72;

export async function GET(request: NextRequest) {
  // Sécurité : Vercel Cron envoie Authorization: Bearer <CRON_SECRET>
  // Permet aussi l'appel manuel depuis /admin
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
    const matches = await fetchWC2026Matches();
    const finishedMatches = matches.filter(m => m.status === "FINISHED");

    // ── 1. Phases knockout ──────────────────────────────────────────────────
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
          .eq("round_reached", currentRoundForStage(match.stage)); // idempotent
        if (!error) log.push(`✓ ${winnerTla} → ${nextRound}`);
      }

      if (loserCode) {
        const { error } = await admin
          .from("teams")
          .update({ is_active: false, eliminated_at: now })
          .eq("country_code", loserCode)
          .eq("is_active", true); // idempotent — ne retouche pas déjà éliminés
        if (!error) log.push(`✗ ${loserTla} éliminé`);
      }
    }

    // ── 2. Fin de phase de groupes ──────────────────────────────────────────
    const groupFinished = finishedMatches.filter(m => m.stage === "GROUP_STAGE");

    if (groupFinished.length >= GROUP_STAGE_TOTAL_MATCHES) {
      log.push("Phase de groupes terminée — calcul des qualifiés");

      const standings = await fetchWC2026Standings();

      // Top 2 de chaque groupe → round_of_32
      const top2Tlas: string[] = [];
      for (const group of standings.filter(s => s.stage === "GROUP_STAGE")) {
        const top2 = group.table.filter(r => r.position <= 2);
        top2Tlas.push(...top2.map(r => r.team.tla));
      }

      // 8 meilleures 3èmes places → round_of_32
      const best8Tlas = getBest8ThirdPlace(standings);

      // Toutes les 3èmes non qualifiées + toutes les 4èmes → éliminées
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

      // Qualifier les 32 équipes
      for (const tla of [...top2Tlas, ...best8Tlas]) {
        const code = tlaToCode(tla);
        if (!code) { log.push(`⚠ TLA inconnu (qualifié): ${tla}`); continue; }
        await admin
          .from("teams")
          .update({ round_reached: "round_of_32", round_advanced_at: now })
          .eq("country_code", code)
          .eq("round_reached", "group_stage");
        log.push(`✓ ${tla} → round_of_32`);
      }

      // Éliminer les non-qualifiés
      for (const tla of eliminatedGroupTlas) {
        const code = tlaToCode(tla);
        if (!code) { log.push(`⚠ TLA inconnu (éliminé): ${tla}`); continue; }
        await admin
          .from("teams")
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

// ── Helpers locaux ───────────────────────────────────────────────────────────

function processKnockoutMatch(match: FDMatch): {
  winnerTla: string;
  loserTla: string;
  nextRound: string;
} | null {
  const { score, homeTeam, awayTeam, stage } = match;
  const nextRound = KNOCKOUT_STAGE_TO_NEXT_ROUND[stage];
  if (!nextRound) return null;
  if (!score.winner || score.winner === "DRAW") return null; // ne devrait pas arriver en knockout

  const winnerTla = score.winner === "HOME_TEAM" ? homeTeam.tla : awayTeam.tla;
  const loserTla  = score.winner === "HOME_TEAM" ? awayTeam.tla : homeTeam.tla;
  return { winnerTla, loserTla, nextRound };
}

// Quel round_reached doit avoir un winner pour qu'on le fasse avancer ?
// (évite de re-avancer une équipe déjà avancée)
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
