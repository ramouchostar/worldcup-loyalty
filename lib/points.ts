import { createAdminClient } from "./supabase";
import { CATALOGUE_BUDGET_PCT, pointsGoalFrom, type CatalogueItem, type PointsGoal } from "./catalogue";

// ADR 0061 — « Mes points » : le solde personnel, dérivé du registre
// point_transactions (jamais de colonne solde). Toutes les écritures passent
// par des fonctions SQL SECURITY DEFINER réservées au rôle serveur
// (atomiques, idempotentes). Jamais d'euros côté membre (ADR 0007).

// ── ADR 0061 — « Mes points » : points par ticket et catalogue ──────────────
// Fonctions de la migration 20260918-0420 (réservées au rôle serveur).
// Tolérantes à leur absence tant que la migration n'est pas appliquée.

export type PointsSummary = {
  /** Utilisables maintenant. */
  available: number;
  /** Points de tickets récents, utilisables 4 h après le ticket (ADR 0061 §2). */
  pending: number;
  /** Prochaine libération de points en attente, ou null. */
  nextAvailableAt: string | null;
};

export async function getPointsSummary(userId: string, restaurantId: string): Promise<PointsSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_points_summary", {
    p_user_id: userId,
    p_restaurant_id: restaurantId,
  });
  if (error) {
    console.error("[points] getPointsSummary failed:", error.message);
    return { available: await getPointsBalance(userId, restaurantId), pending: 0, nextAvailableAt: null };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { available: number | null; pending: number | null; next_available_at: string | null }
    | null;
  return {
    available: Number(row?.available ?? 0),
    pending: Number(row?.pending ?? 0),
    nextAvailableAt: row?.next_available_at ?? null,
  };
}

/** Le catalogue d'un établissement : nom, photo, prix en points — jamais le coût (ADR 0007). */
export async function listCatalogue(restaurantId: string): Promise<CatalogueItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("catalog_items", { p_restaurant_id: restaurantId });
  if (error) {
    console.error("[points] listCatalogue failed:", error.message);
    return [];
  }
  return ((data ?? []) as { item_id: string; item_name: string; image_path: string | null; price_points: number | null }[])
    .filter((r) => r.price_points != null && r.price_points > 0)
    .map((r) => ({ id: r.item_id, name: r.item_name, imagePath: r.image_path, pricePoints: Number(r.price_points) }));
}

export type CatalogueExchangeError = "invalid_item" | "insufficient_points" | "active_reward_exists";

/** Échange des points contre un article du catalogue — le prix est recalculé en SQL. */
export async function exchangeCatalogueItem(
  userId: string,
  restaurantId: string,
  itemId: string
): Promise<{ rewardId: string } | { error: CatalogueExchangeError }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("exchange_points_for_item", {
    p_user_id: userId,
    p_restaurant_id: restaurantId,
    p_item_id: itemId,
  });
  if (error) {
    if (error.message.includes("invalid_item")) return { error: "invalid_item" };
    if (error.message.includes("insufficient_points")) return { error: "insufficient_points" };
    // Un cadeau à la fois (ADR 0011) : la transaction SQL a tout annulé.
    if (error.code === "23505" || error.message.includes("idx_one_active_reward_per_member")) {
      return { error: "active_reward_exists" };
    }
    throw new Error(`exchange_points_for_item failed: ${error.message}`);
  }
  return { rewardId: String(data) };
}

export async function getPointsBalance(userId: string, restaurantId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_points_balance", {
    p_user_id: userId,
    p_restaurant_id: restaurantId,
  });
  if (error) {
    console.error("[points] getPointsBalance failed:", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

/**
 * Taux du catalogue de l'établissement (même ordre que la fonction SQL
 * `catalog_price_points`, qui fait foi) : réglage durable
 * `restaurant_reward_settings`, sinon budget du dernier mois, sinon 8 %.
 * Kraainem est à 4 % depuis le 2026-09-19 (cadeaux deux fois plus chers).
 */
export async function getCataloguePct(restaurantId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("restaurant_reward_settings")
    .select("catalogue_budget_pct")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const own = Number((settings as { catalogue_budget_pct: number | null } | null)?.catalogue_budget_pct);
  if (own > 0) return own;
  const { data: month } = await admin
    .from("reward_budget_tracking")
    .select("budget_pct")
    .eq("restaurant_id", restaurantId)
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  const monthly = Number((month as { budget_pct: number | null } | null)?.budget_pct);
  return monthly > 0 ? monthly : CATALOGUE_BUDGET_PCT;
}

/** Ce que les points d'un membre permettent (ADR 0061 §5) — écran de succès, accueil. */
export async function getPointsGoal(userId: string, restaurantId: string): Promise<PointsGoal> {
  const [summary, catalogue] = await Promise.all([getPointsSummary(userId, restaurantId), listCatalogue(restaurantId)]);
  return pointsGoalFrom(summary.available, summary.pending, catalogue);
}
