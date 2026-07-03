import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getUnlockedRewards, isMemberActive } from "@/lib/rewards";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getBudgetStatus } from "@/lib/budget";
import type { Reward } from "@/types";

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

  // Couverture d'équipe (ADR 0017) — total_spent en euros : service role
  // uniquement, jamais renvoyé dans la réponse (ADR 0007)
  const admin = createAdminClient();
  const [{ data: spentRow }, budget, restaurantUnlocked, memberActive] = await Promise.all([
    admin
      .from("community_scores")
      .select("total_spent")
      .eq("team_id", membership.team_id)
      .eq("restaurant_id", restaurantId)
      .single(),
    getBudgetStatus(restaurantId),
    isRestaurantThresholdUnlocked(restaurantId),
    isMemberActive(user.id),
  ]);
  const coverage = {
    memberCount,
    teamTotalSpent: Number((spentRow as { total_spent: number } | null)?.total_spent ?? 0),
    budgetPct: budget.budgetPct,
  };

  const unlocked = await getUnlockedRewards(restaurantId, teamScore, memberCount, restaurantUnlocked, coverage);

  // cost_euros (coût du cadeau) jamais renvoyé côté membre (ADR 0007)
  const safe = unlocked.map(({ cost_euros: _cost, ...rest }: Reward) => rest);

  return NextResponse.json({ unlocked: safe, restaurantUnlocked, memberActive, teamScore, memberCount });
}
