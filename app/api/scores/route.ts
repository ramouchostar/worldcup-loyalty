import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";
import { applyRoundBonus } from "@/lib/score";

type TeamRow = {
  name: string;
  flag_emoji: string;
  country_code: string;
  is_active: boolean;
  round_reached: string;
  round_advanced_at: string | null;
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
        country_code,
        is_active,
        round_reached,
        round_advanced_at
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
        score: applyRoundBonus(row.score ?? 0, team?.round_advanced_at ?? null),
        last_updated: row.last_updated,
        teams: {
          name: team.name,
          flag_emoji: team.flag_emoji,
          country_code: team.country_code,
          is_active: team.is_active,
          round_reached: team.round_reached,
        },
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json(result);
}
