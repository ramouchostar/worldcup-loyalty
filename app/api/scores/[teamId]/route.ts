import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { applyRoundBonus } from "@/lib/score";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("community_scores")
    .select("team_id, member_count, score, last_updated, teams(round_advanced_at)")
    .eq("team_id", teamId)
    .single();

  if (error) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const team = data.teams as unknown as { round_advanced_at: string | null } | null;
  const score = applyRoundBonus(data.score ?? 0, team?.round_advanced_at ?? null);

  return NextResponse.json({
    team_id: data.team_id,
    member_count: data.member_count,
    score,
    last_updated: data.last_updated,
  });
}
