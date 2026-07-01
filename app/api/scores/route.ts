import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

type TeamRow = {
  name: string;
  flag_emoji: string;
  is_active: boolean;
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const restaurantId = getRestaurantId();

  const { data, error } = await supabase
    .from("community_scores")
    .select(`
      team_id,
      member_count,
      score,
      last_updated,
      teams (
        name,
        flag_emoji,
        is_active
      )
    `)
    .eq("restaurant_id", restaurantId);

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });

  const result = (data ?? [])
    .map((row) => {
      const team = row.teams as unknown as TeamRow;
      return {
        team_id: row.team_id,
        member_count: row.member_count,
        score: Number(row.score ?? 0), // ADR 0014 : plus de bonus ×1.5
        last_updated: row.last_updated,
        teams: {
          name: team.name,
          flag_emoji: team.flag_emoji,
          is_active: team.is_active,
        },
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json(result);
}
