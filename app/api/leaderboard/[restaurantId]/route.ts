import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

// GET /api/leaderboard/[restaurantId] — données de classement EURO-FREE pour le
// polling client (remplace l'abonnement Realtime qui transportait total_spent).
// total_spent n'est JAMAIS sélectionné ici (ADR 0007) ; de toute façon la clé
// anon/authenticated n'y a plus accès (grant colonne, m41). Public comme la
// page /r/[id]/leaderboard.
export async function GET(_req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("community_scores")
    .select("team_id, member_count, score, last_updated, teams!inner(name, flag_emoji, is_active)")
    .eq("teams.restaurant_id", restaurantId)
    .order("score", { ascending: false });

  if (error) return NextResponse.json([], { status: 200 });

  const rows = ((data ?? []) as unknown as { teams: { is_active: boolean } | null }[]).filter(
    (s) => s.teams?.is_active
  );
  return NextResponse.json(rows);
}
