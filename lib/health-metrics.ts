import { createAdminClient } from "./supabase";
import { listLiveRestaurantIds } from "./demo";

// Chiffres de santé produit pour /platform/stats — quelques requêtes ciblées
// et légères (comptages + une seule liste {user_id, order_date}), scopées au
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
  /**
   * Détail de la récupération, parce que le taux seul ne dit pas de quel côté
   * la boucle casse : combien de coupons le membre a ouverts, combien le
   * comptoir a confirmés, combien de cadeaux personne n'est venu chercher.
   */
  couponsOpened: number;
  giftsRemitted: number;
  rewardsExpired: number;
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
  couponsOpened: 0,
  giftsRemitted: 0,
  rewardsExpired: 0,
};

export async function getHealthMetrics(): Promise<HealthMetrics> {
  const admin = createAdminClient();
  const restaurantIds = await listLiveRestaurantIds(admin);
  if (restaurantIds.length === 0) return EMPTY;

  // Les super-admins plateforme testent en prod sur le réseau réel (pas de
  // resto démo dédié) — leurs propres tickets/cadeaux gonflent artificiellement
  // ces chiffres. On les exclut de toutes les requêtes par leur id, pas par email
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

  // Chaque comptage est réduit à un `number` DANS sa propre promesse, au lieu
  // de faire voyager cinq objets de réponse Supabase jusqu'au `Promise.all` :
  // au-delà de quatre, l'inférence du tuple part en TS2589 (« type
  // instantiation is excessively deep »). Effet secondaire agréable : les
  // vérifications d'erreur vivent à côté de leur requête.
  const countOf = async (
    query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
    label: string
  ): Promise<number> => {
    const { count, error } = await query;
    if (error) throw new Error(`${label}: ${error.message}`);
    return count ?? 0;
  };

  const [totalMembers, orders, couponsOpened, rewardsExpired, giftsRemitted] = await Promise.all([
    countOf(
      excludeSuperAdmins(
        admin.from("memberships").select("user_id", { count: "exact", head: true }).in("restaurant_id", restaurantIds)
      ),
      "memberships"
    ),
    (async () => {
      const { data, error } = await excludeSuperAdmins(
        admin
          .from("orders")
          .select("user_id, order_date")
          .eq("status", "validated")
          .in("restaurant_id", restaurantIds)
      );
      if (error) throw new Error(`orders: ${error.message}`);
      return ((data as unknown as { user_id: string; order_date: string }[] | null) ?? []);
    })(),
    // `status = 'redeemed'` = le membre a OUVERT son coupon, pas « cadeau
    // remis » : le statut est posé par le compare-and-swap anti-double-coupon
    // de `/api/redemption/generate` (ADR 0050 §Contexte).
    countOf(
      excludeSuperAdmins(
        admin
          .from("pending_rewards")
          .select("id", { count: "exact", head: true })
          .eq("status", "redeemed")
          .in("restaurant_id", restaurantIds)
      ),
      "pending_rewards(coupon ouvert)"
    ),
    countOf(
      excludeSuperAdmins(
        admin
          .from("pending_rewards")
          .select("id", { count: "exact", head: true })
          .eq("status", "expired")
          .in("restaurant_id", restaurantIds)
      ),
      "pending_rewards(expired)"
    ),
    // Le cadeau RÉELLEMENT remis : `redemption_tokens.redeemed_at`, posé par
    // le bouton « Cadeau remis » du comptoir (`/admin/coupon/[token]`). Au
    // plus un token par cadeau — sa création exige `status = 'available'` et
    // l'a déjà basculé en `redeemed` — donc ce compte ne dépasse jamais celui
    // des coupons ouverts.
    countOf(
      // `.not("redeemed_at", …)` est appliqué APRÈS `excludeSuperAdmins`, pas
      // avant : chaîner deux `.not()` avant le helper générique fait exploser
      // l'inférence du client Supabase (TS2589). Le filtre est le même, l'ordre
      // des clauses n'a aucun effet sur la requête émise.
      excludeSuperAdmins(
        admin
          .from("redemption_tokens")
          .select("id", { count: "exact", head: true })
          .in("restaurant_id", restaurantIds)
      ).not("redeemed_at", "is", null),
      "redemption_tokens(remis)"
    ),
  ]);

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

  // Rappel de ce que le bug était (ADR 0050) : compter `status = 'redeemed'`
  // comme une récupération. Sur kraainem au 2026-09-09, 6 coupons ouverts,
  // ZÉRO confirmé au comptoir, et la tuile annonçait 100 %. Elle ne pouvait
  // d'ailleurs annoncer que ça — le dénominateur ajoutait `expired`, qui
  // n'existait dans aucune ligne faute du cron horaire de l'ADR 0011 (voir
  // lib/reward-expiry.ts). Les deux défauts se couvraient l'un l'autre.
  return {
    restaurantCount: restaurantIds.length,
    activation: metric(activatedMembers, totalMembers, 30, 15),
    retention: metric(retainedMembers, activatedMembers, 40, 20),
    // "Tranché" = coupon ouvert + expiré ; un cadeau encore `available` n'a
    // pas fini ses 48 h (ADR 0011), on ne sait pas de quel côté il tombera.
    // Au numérateur, le seul fait qui prouve que la boucle se referme : le
    // comptoir a confirmé la remise.
    redemption: metric(giftsRemitted, couponsOpened + rewardsExpired, 70, 40),
    couponsOpened,
    giftsRemitted,
    rewardsExpired,
  };
}
