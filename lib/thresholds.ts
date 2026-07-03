import { createAdminClient } from "./supabase";
import type { RestaurantThreshold } from "@/types";

const DEFAULT_GROWTH_TARGET_PCT = parseFloat(process.env.GROWTH_TARGET_PCT ?? "0.10");

// Service role : restaurant_thresholds n'a aucune policy RLS de lecture (données
// CA, ADR 0007) — avec le client utilisateur, la lecture renvoyait toujours null
// et le double verrou ne se déverrouillait jamais côté membre. Les appelants ne
// renvoient que le booléen au client, jamais les montants.
export async function getCurrentThreshold(restaurantId: string): Promise<RestaurantThreshold | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("restaurant_thresholds")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

// Lundi 00:00 UTC de la semaine en cours
function startOfCurrentWeekISO(): string {
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday
  ));
  return monday.toISOString();
}

// Double verrou basé sur la CROISSANCE (ADR 0012 garde-fou 2) :
// déverrouillé si le CA validé de la semaine en cours dépasse
// baseline_weekly_revenue × (1 + growth_target_pct). Le restaurant ne
// débloque que s'il vend PLUS qu'avant le programme.
// is_unlocked = true reste un override manuel admin.
export async function isRestaurantThresholdUnlocked(restaurantId: string): Promise<boolean> {
  const threshold = await getCurrentThreshold(restaurantId);
  if (!threshold) return false;
  if (threshold.is_unlocked) return true;

  const baseline = Number(threshold.baseline_weekly_revenue ?? 0);
  if (baseline <= 0) return false; // pas de baseline configurée → verrouillé

  const growthPct = Number(threshold.growth_target_pct ?? DEFAULT_GROWTH_TARGET_PCT);
  const growthTarget = baseline * (1 + growthPct);

  // Somme des commandes validées de la semaine — service role : la RLS
  // sur orders limite chaque membre à ses propres lignes
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("amount")
    .eq("restaurant_id", restaurantId)
    .eq("status", "validated")
    .gte("submitted_at", startOfCurrentWeekISO());

  if (error) return false;

  const weekRevenue = (data ?? []).reduce((sum, o) => sum + Number(o.amount), 0);
  return weekRevenue >= growthTarget;
}
