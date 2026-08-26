import { createAdminClient } from "./supabase";
import { listLiveRestaurantIds } from "./demo";

// Chiffres de santé produit pour /platform/stats — trois requêtes ciblées et
// légères (comptages + une seule liste {user_id, order_date}), scopées au
// réseau réel (ADR 0033, listLiveRestaurantIds). Volontairement PAS l'agrégat
// multi-tables 12 mois de l'ancienne page (lib/platform-stats.ts, retiré) :
// c'est cette agrégation lourde qui provoquait l'erreur serveur en prod.

export type Tier = "good" | "mid" | "low";

export type HealthMetric = {
  /** Pourcentage 0–100, null tant qu'il n'y a pas de dénominateur. */
  rate: number | null;
  numerator: number;
  denominator: number;
  tier: Tier;
};

export type HealthMetrics = {
  restaurantCount: number;
  activation: HealthMetric;
  retention: HealthMetric;
  redemption: HealthMetric;
};

function tierOf(rate: number | null, goodMin: number, midMin: number): Tier {
  if (rate === null) return "low";
  if (rate >= goodMin) return "good";
  if (rate >= midMin) return "mid";
  return "low";
}

function metric(numerator: number, denominator: number, goodMin: number, midMin: number): HealthMetric {
  const rate = denominator > 0 ? (numerator / denominator) * 100 : null;
  return { rate, numerator, denominator, tier: tierOf(rate, goodMin, midMin) };
}

const EMPTY: HealthMetrics = {
  restaurantCount: 0,
  activation: metric(0, 0, 30, 15),
  retention: metric(0, 0, 40, 20),
  redemption: metric(0, 0, 70, 40),
};

export async function getHealthMetrics(): Promise<HealthMetrics> {
  const admin = createAdminClient();
  const restaurantIds = await listLiveRestaurantIds(admin);
  if (restaurantIds.length === 0) return EMPTY;

  // Les super-admins plateforme testent en prod sur le réseau réel (pas de
  // resto démo dédié) — leurs propres tickets/cadeaux gonflent artificiellement
  // ces chiffres. On les exclut des quatre requêtes par leur id, pas par email
  // en dur : ça suit `profiles.is_super_admin` (bootstrappé par SUPER_ADMIN_EMAILS)
  // sans re-coder une liste ailleurs.
  const { data: superAdmins, error: superAdminsError } = await admin
    .from("profiles")
    .select("id")
    .eq("is_super_admin", true);
  if (superAdminsError) throw new Error(`profiles(super_admin): ${superAdminsError.message}`);
  const excludedIds = ((superAdmins as { id: string }[] | null) ?? []).map((p) => p.id);
  const excludeSuperAdmins = <T extends { not: (column: string, operator: string, value: unknown) => T }>(
    query: T
  ): T => (excludedIds.length > 0 ? query.not("user_id", "in", `(${excludedIds.join(",")})`) : query);

  const [membersRes, ordersRes, redeemedRes, expiredRes] = await Promise.all([
    excludeSuperAdmins(
      admin.from("memberships").select("user_id", { count: "exact", head: true }).in("restaurant_id", restaurantIds)
    ),
    excludeSuperAdmins(
      admin
        .from("orders")
        .select("user_id, order_date")
        .eq("status", "validated")
        .in("restaurant_id", restaurantIds)
    ),
    excludeSuperAdmins(
      admin
        .from("pending_rewards")
        .select("id", { count: "exact", head: true })
        .eq("status", "redeemed")
        .in("restaurant_id", restaurantIds)
    ),
    excludeSuperAdmins(
      admin
        .from("pending_rewards")
        .select("id", { count: "exact", head: true })
        .eq("status", "expired")
        .in("restaurant_id", restaurantIds)
    ),
  ]);

  if (membersRes.error) throw new Error(`memberships: ${membersRes.error.message}`);
  if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`);
  if (redeemedRes.error) throw new Error(`pending_rewards(redeemed): ${redeemedRes.error.message}`);
  if (expiredRes.error) throw new Error(`pending_rewards(expired): ${expiredRes.error.message}`);

  const totalMembers = membersRes.count ?? 0;
  const orders = (ordersRes.data as { user_id: string; order_date: string }[] | null) ?? [];

  // Membre "activé" = a validé au moins un ticket. "Retenu" = au moins deux
  // JOURS de commande distincts (pas deux lignes le même jour).
  const datesByUser = new Map<string, Set<string>>();
  for (const o of orders) {
    const set = datesByUser.get(o.user_id) ?? new Set<string>();
    set.add(o.order_date);
    datesByUser.set(o.user_id, set);
  }
  const activatedMembers = datesByUser.size;
  let retainedMembers = 0;
  for (const dates of datesByUser.values()) if (dates.size >= 2) retainedMembers++;

  const redeemedCount = redeemedRes.count ?? 0;
  const expiredCount = expiredRes.count ?? 0;

  return {
    restaurantCount: restaurantIds.length,
    activation: metric(activatedMembers, totalMembers, 30, 15),
    retention: metric(retainedMembers, activatedMembers, 40, 20),
    // "Tranché" = redeemed + expired ; un cadeau encore `available` n'a pas
    // fini ses 48h (ADR 0011), on ne sait pas encore de quel côté il tombera.
    redemption: metric(redeemedCount, redeemedCount + expiredCount, 70, 40),
  };
}
