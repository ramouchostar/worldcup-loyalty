import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const restaurantId = getRestaurantId();

  const { data, error } = await supabase
    .from("community_scores")
    .select(`
      team_id,
      member_count,
      total_spent,
      score,
      last_updated,
      teams (
        name,
        flag_emoji,
        country_code,
        is_active,
        round_reached
      )
    `)
    .eq("restaurant_id", restaurantId)
    .order("score", { ascending: false });

  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  return NextResponse.json(data ?? []);
}
