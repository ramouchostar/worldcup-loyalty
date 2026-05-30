import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getUnlockedRewards, isMemberActive } from "@/lib/rewards";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getRestaurantId } from "@/lib/restaurant";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (!profile?.team_id) {
    return NextResponse.json({ unlocked: [], restaurantUnlocked: false, memberActive: false });
  }

  const restaurantId = getRestaurantId();

  const { data: score } = await supabase
    .from("community_scores")
    .select("score, member_count")
    .eq("team_id", profile.team_id)
    .eq("restaurant_id", restaurantId)
    .single();

  const teamScore = score?.score ?? 0;
  const memberCount = score?.member_count ?? 0;
  const restaurantUnlocked = await isRestaurantThresholdUnlocked();
  const memberActive = await isMemberActive(user.id);
  const unlocked = await getUnlockedRewards(teamScore, memberCount, restaurantUnlocked);

  return NextResponse.json({ unlocked, restaurantUnlocked, memberActive, teamScore, memberCount });
}
