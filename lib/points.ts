import { createAdminClient } from "./supabase";

// ADR 0021 — Réserve de points personnelle (« Ma réserve »).
// Solde et mouvements dérivés du ledger point_transactions ; toutes les
// écritures passent par les RPC SECURITY DEFINER de m33 (atomiques,
// idempotents). Les deltas sont en points — jamais d'euros côté membre,
// mais le mot « points » seul reste réservé au score communautaire
// dans l'UI (ADR 0007) : afficher « réserve ».

export type ExchangeError = "invalid_tier" | "insufficient_points" | "active_reward_exists";

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
