import { createAdminClient } from "./supabase";
import { DEFAULT_AVG_BASKET } from "./reward-sizing";

// ADR 0017 — panier moyen des commandes validées de l'établissement, base du
// dimensionnement des paliers solo et du plafond du cadeau jetons.
// Donnée euros : service role uniquement, jamais côté membre (ADR 0007).
export async function getAverageBasket(restaurantId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("amount")
    .eq("restaurant_id", restaurantId)
    .eq("status", "validated")
    .order("submitted_at", { ascending: false })
    .limit(1000); // les 1000 dernières suffisent pour une moyenne stable

  if (error || !data || data.length === 0) return DEFAULT_AVG_BASKET;
  const total = data.reduce((s, r) => s + Number((r as { amount: number }).amount), 0);
  return total / data.length;
}
