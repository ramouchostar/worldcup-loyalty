import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { fetchWC2026Matches } from "@/lib/football-data";

// POST /api/admin/import-schedule
// Action unique : importe tout le calendrier WC2026 depuis football-data.org
// dans la table wc2026_matches. Idempotent (upsert).
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (!process.env.FOOTBALL_DATA_API_KEY) {
    return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY manquant" }, { status: 500 });
  }

  const matches = await fetchWC2026Matches();

  const rows = matches.map((m) => ({
    fd_id:         m.id,
    stage:         m.stage,
    group_name:    m.group ?? null,
    kickoff_utc:   m.utcDate,
    home_tla:      m.homeTeam?.tla || null,
    away_tla:      m.awayTeam?.tla || null,
    home_score:    m.score.fullTime.home ?? null,
    away_score:    m.score.fullTime.away ?? null,
    penalties_home: m.score.penalties?.home ?? null,
    penalties_away: m.score.penalties?.away ?? null,
    winner:        m.score.winner ?? null,
    status:        m.status,
  }));

  const admin = createAdminClient();
  const { error } = await admin
    .from("wc2026_matches")
    .upsert(rows, { onConflict: "fd_id" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, imported: rows.length });
}
