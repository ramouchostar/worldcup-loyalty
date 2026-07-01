import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getUnlockedRewards, isMemberActive } from "@/lib/rewards";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("team_id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!membership?.team_id) {
    return NextResponse.json({ unlocked: [], restaurantUnlocked: false, memberActive: false });
  }

  const { data: score } = await supabase
    .from("community_scores")
    .select("score, member_count")
    .eq("team_id", membership.team_id)
    .eq("restaurant_id", restaurantId)
    .single();

  const teamScore = score?.score ?? 0;
  const memberCount = score?.member_count ?? 0;
  const restaurantUnlocked = await isRestaurantThresholdUnlocked(restaurantId);
  const memberActive = await isMemberActive(user.id);
  const unlocked = await getUnlockedRewards(teamScore, memberCount, restaurantUnlocked);

  return NextResponse.json({ unlocked, restaurantUnlocked, memberActive, teamScore, memberCount });
}
