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
   * Détail de la réclamation : combien de cadeaux le membre est venu chercher,
   * combien personne n'est venu chercher. La REMISE elle-même (le geste au
   * comptoir) n'est pas mesurable — voir le commentaire de `redemption`.
   */
  rewardsClaimed: number;
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
  rewardsClaimed: 0,
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

  const [totalMembers, orders, rewardsClaimed, rewardsExpired] = await Promise.all([
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
    // `status = 'redeemed'` = le cadeau a été RÉCLAMÉ. Deux chemins y mènent,
    // et les deux sont de vraies réclamations : le membre ouvre son coupon au
    // comptoir (`/api/redemption/generate`), ou le restaurateur le marque à la
    // main depuis sa console (`/api/admin/pending-rewards`).
    countOf(
      excludeSuperAdmins(
        admin
          .from("pending_rewards")
          .select("id", { count: "exact", head: true })
          .eq("status", "redeemed")
          .in("restaurant_id", restaurantIds)
      ),
      "pending_rewards(réclamé)"
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

  // CE QUE CE TAUX MESURE, ET CE QU'IL NE MESURE PAS (ADR 0050, amendé).
  //
  // Il mesure la RÉCLAMATION : le membre est-il venu chercher son cadeau dans
  // ses 48 h ? C'est une question à laquelle la base sait répondre.
  //
  // Il ne mesure PAS la remise physique au comptoir, et aucune colonne ne le
  // peut. `redemption_tokens.redeemed_at` en avait l'air, et une première
  // version de cette tuile s'en servait — à tort : ce champ n'est posé que par
  // l'écran `/admin/coupon/[token]`, qui n'est lié depuis nulle part (un jeton
  // de 12 caractères à taper à la main) et que le parcours réel court-circuite,
  // puisque l'ouverture du coupon a déjà sorti le cadeau de la liste « À
  // remettre » du restaurateur. Résultat : 0 sur 9 coupons, alors que les
  // cadeaux étaient bel et bien remis (constat terrain, 2026-09-12). Compter ce
  // champ revenait à mesurer l'usage d'un bouton, pas la vie du programme.
  return {
    restaurantCount: restaurantIds.length,
    activation: metric(activatedMembers, totalMembers, 30, 15),
    retention: metric(retainedMembers, activatedMembers, 40, 20),
    // "Tranché" = réclamé + expiré ; un cadeau encore `available` n'a pas fini
    // ses 48 h (ADR 0011), on ne sait pas de quel côté il tombera.
    redemption: metric(rewardsClaimed, rewardsClaimed + rewardsExpired, 70, 40),
    rewardsClaimed,
    rewardsExpired,
  };
}
