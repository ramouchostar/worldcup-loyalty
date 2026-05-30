import { createServerSupabaseClient } from "./supabase";
import { getRestaurantId } from "./restaurant";
import type { RestaurantThreshold } from "@/types";

export async function getCurrentThreshold(): Promise<RestaurantThreshold | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("restaurant_thresholds")
    .select("*")
    .eq("restaurant_id", getRestaurantId())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function isRestaurantThresholdUnlocked(): Promise<boolean> {
  const threshold = await getCurrentThreshold();
  return threshold?.is_unlocked ?? false;
}
