import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("community_scores")
    .select("team_id, member_count, score, last_updated")
    .eq("team_id", teamId)
    .maybeSingle();

  return NextResponse.json({
    team_id: teamId,
    member_count: data?.member_count ?? 0,
    score: Number(data?.score ?? 0), // ADR 0014 : plus de bonus ×1.5
    last_updated: data?.last_updated ?? null,
  });
}
