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
