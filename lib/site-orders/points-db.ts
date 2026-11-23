// ADR 0108 §5 — ce que l'application demande à la base sur les commandes du site quand elle valide un ticket. Service role
// uniquement. FAIL-OPEN : une table ou une colonne absente (migrations pas appliquées) ou une panne se lit « non » — jamais un
// ticket refusé ou retardé parce que la base des commandes du site ne répond pas.

import { createAdminClient } from "../supabase";
import { SITE_ORDER_LIVE_STATUSES, recentSiteOrderSince } from "./points";

/**
 * Ce compte a-t-il, dans ce restaurant, une commande du site (reçue, prête ou retirée) passée OU retirée dans les six dernières
 * heures ? Alors le ticket qu'il envoie est probablement le même repas : il va en revue au lieu d'être validé tout seul
 * (le restaurateur voit « Commande du site récente »). Le sens inverse (commande retirée après un ticket) est gardé par la base.
 */
export async function hasRecentSiteOrder(userId: string, restaurantId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const since = recentSiteOrderSince(now);
    const { data, error } = await createAdminClient()
      .from("site_orders")
      .select("id")
      .eq("member_id", userId)
      .eq("restaurant_id", restaurantId)
      .in("status", [...SITE_ORDER_LIVE_STATUSES])
      .or(`created_at.gte.${since},picked_up_at.gte.${since}`)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
