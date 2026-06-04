import { createServerSupabaseClient } from "./supabase";
import { getRestaurantId } from "./restaurant";
import type { Reward } from "@/types";

// Double lock: rewards only unlock if BOTH conditions are met:
// 1. Community score exceeds the tier threshold
// 2. Restaurant revenue threshold is unlocked (is_unlocked = true)
// Family Bucket (level 5) adds a third condition: min_member_count
export async function getUnlockedRewards(
  teamScore: number,
  memberCount: number,
  restaurantThresholdUnlocked: boolean
): Promise<Reward[]> {
  if (!restaurantThresholdUnlocked) return [];

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("rewards")
    .select("*")
    .eq("is_active", true)
    .eq("restaurant_id", getRestaurantId())
    .lte("score_threshold", teamScore)
    .order("level", { ascending: true });

  return (data ?? []).filter((r: Reward) => memberCount >= r.min_member_count);
}

// Active member = at least 1 validated order
export async function isMemberActive(userId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", "validated");

  return (count ?? 0) > 0;
}

// ─── 3-layer reward calculation (ADR 0006) ───────────────────────────────────

type RewardItem = { item: string | null; cost: number };

// Layer 1 — Solo reward based on order amount. No double verrou.
export function getSoloReward(amount: number): RewardItem {
  if (amount >= 60) return { item: "Chef's Combo", cost: 1.92 };
  if (amount >= 40) return { item: "Menu 4 Tenders", cost: 1.93 };
  if (amount >= 25) return { item: "Finest burger", cost: 0.94 };
  if (amount >= 15) return { item: "Churros 6 pcs", cost: 0.31 };
  return { item: null, cost: 0 };
}

// Layer 2 — Community bonus based on team score. Requires double verrou.
export function getCommunityBonus(score: number, restaurantUnlocked: boolean): RewardItem {
  if (!restaurantUnlocked || score < 1000) return { item: null, cost: 0 };
  if (score >= 10000) return { item: "Menu 4 Tenders", cost: 1.93 };
  if (score >= 6000)  return { item: "Finest burger", cost: 0.94 };
  if (score >= 3000)  return { item: "Churros 12 pcs", cost: 0.63 };
  return { item: "Frites Medium", cost: 0.24 };
}

// Layer 3 — Advancement bonus while team is still in the tournament. No double verrou.
export function getAdvancementBonus(roundReached: string, isEliminated: boolean): RewardItem {
  if (isEliminated) return { item: null, cost: 0 };
  if (roundReached === "final" || roundReached === "winner") return { item: "Chef's Combo", cost: 1.92 };
  if (roundReached === "semi_final")   return { item: "Menu 4 Tenders", cost: 1.93 };
  if (roundReached === "quarter_final") return { item: "Finest burger", cost: 0.94 };
  if (roundReached === "round_of_16")  return { item: "Churros 6 pcs", cost: 0.31 };
  return { item: null, cost: 0 }; // group_stage — not yet advanced
}
