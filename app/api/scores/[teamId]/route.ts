import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("community_scores")
    .select("team_id, member_count, total_spent, score, last_updated")
    .eq("team_id", teamId)
    .single();

  if (error) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(data);
}
