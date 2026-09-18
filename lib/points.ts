import { createAdminClient } from "./supabase";
import type { CatalogueItem } from "./catalogue";

// ADR 0021 — Réserve de points personnelle (« Ma réserve »).
// Solde et mouvements dérivés du ledger point_transactions ; toutes les
// écritures passent par les RPC SECURITY DEFINER de m33 (atomiques,
// idempotents). Les deltas sont en points — jamais d'euros côté membre,
// mais le mot « points » seul reste réservé au score communautaire
// dans l'UI (ADR 0007) : afficher « réserve ».

export type ExchangeError = "invalid_tier" | "insufficient_points" | "active_reward_exists";

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

// Convertit le cadeau disponible en points (statut 'banked', slot libéré).
// Retourne les points crédités — 0 si aucun cadeau bankable (déjà banké,
// déjà récupéré, ou cadeau 'saver').
export async function bankReward(rewardId: string, userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("bank_reward", {
    p_reward_id: rewardId,
    p_user_id: userId,
  });
  if (error) throw new Error(`bank_reward failed: ${error.message}`);
  return Number(data ?? 0);
}

// Échange le solde contre un gros cadeau du palier 'saver' — crée un
// pending_rewards 'available' standard qui suit le cycle coupon existant.
export async function exchangePointsForGift(
  userId: string,
  restaurantId: string,
  tierId: string
): Promise<{ rewardId: string } | { error: ExchangeError }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("exchange_points_for_gift", {
    p_user_id: userId,
    p_restaurant_id: restaurantId,
    p_tier_id: tierId,
  });
  if (error) {
    if (error.message.includes("invalid_tier")) return { error: "invalid_tier" };
    if (error.message.includes("insufficient_points")) return { error: "insufficient_points" };
    // 23505 sur l'index partiel un-seul-actif (ADR 0011) : le membre a déjà
    // un cadeau disponible — la transaction SQL a tout annulé, aucun débit.
    if (error.code === "23505" || error.message.includes("idx_one_active_reward_per_member")) {
      return { error: "active_reward_exists" };
    }
    throw new Error(`exchange_points_for_gift failed: ${error.message}`);
  }
  return { rewardId: String(data) };
}
