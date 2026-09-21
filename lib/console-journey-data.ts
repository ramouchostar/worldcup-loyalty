import { createAdminClient } from "./supabase";
import { getRestaurantBranding } from "./restaurant";
import { getStaffStats } from "./staff-codes";
import { getCatalogGaps } from "./catalog-gaps";
import { getBudgetStatus } from "./budget";
import { todayInBrussels } from "./qr-funnel";
import { addDays, countByDay, GROWTH_WINDOW_DAYS, type SimpleHomeRaw } from "./console-journey";

// Lecture des chiffres de l'accueil simple (ADR 0064) — service-role, borné à
// UN établissement, jamais exposé à un membre.
//
// Fail-open de bout en bout, comme le reste de la console : une table absente
// ou une panne donne un zéro prudent, jamais une page cassée. Un zéro prudent
// peut tout de même tromper (leçon de l'ADR 0050 : un 0 % se suspecte avant
// de se croire) — c'est pourquoi chaque compteur vient d'une colonne écrite
// par un geste réel : `orders.submitted_at` (envoi du ticket),
// `memberships.joined_at` (adhésion), `qr_landings` (arrivée sur la vitrine).

/** 45 jours de tickets : 14 jours affichés + 7 pour l'objectif + marge. */
const HISTORY_DAYS = 45;

export async function loadSimpleHomeRaw(restaurantId: string, opts: { canManage: boolean }): Promise<SimpleHomeRaw> {
  const admin = createAdminClient();
  const today = todayInBrussels();
  const now = Date.now();
  const since = new Date(now - HISTORY_DAYS * 86_400_000).toISOString();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const windowStart = addDays(today, -GROWTH_WINDOW_DAYS);
  const landingsSince = addDays(today, -14);

  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
    try {
      const { count: c, error } = await q;
      return error ? 0 : c ?? 0;
    } catch {
      return 0;
    }
  };

  const [
    recent,
    validatedTotal,
    validatedWindow,
    validatedWeekAgo,
    membersTotal,
    membersWeekAgo,
    pendingRows,
    claims,
    catalogItemsWithCost,
    landings,
    staff,
    catalogGaps,
    budget,
    branding,
  ] = await Promise.all([
    // Tickets reçus : validés ET en attente — l'objectif mesure ce que le
    // comptoir a déclenché, pas la vitesse de la file de vérification.
    admin
      .from("orders")
      .select("submitted_at")
      .eq("restaurant_id", restaurantId)
      .in("status", ["validated", "pending"])
      .gte("submitted_at", since)
      .limit(5000)
      .then((r) => ((r.data ?? []) as { submitted_at: string }[]).map((o) => o.submitted_at), () => [] as string[]),
    count(admin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "validated")),
    // Même fenêtre et même colonne que la page Opportunités (order_date,
    // 90 jours) : l'étape « Faire grandir » s'ouvre quand les idées ont de
    // quoi se calculer, pas avant.
    count(
      admin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "validated").gte("order_date", windowStart)
    ),
    count(
      admin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "validated").lt("submitted_at", weekAgo)
    ),
    count(admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    count(admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).lt("joined_at", weekAgo)),
    admin
      .from("orders")
      .select("flag_reasons")
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending")
      .then((r) => (r.data ?? []) as { flag_reasons: string[] | null }[], () => []),
    count(admin.from("micro_reward_claims").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending")),
    count(
      admin.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("is_active", true).not("cost_price", "is", null)
    ),
    // Arrivées ANONYMES seulement : un membre qui revient ne prouve pas que
    // le QR est affiché, un inconnu qui arrive sur la vitrine, si.
    admin
      .from("qr_landings")
      .select("count")
      .eq("restaurant_id", restaurantId)
      .eq("visitor", "anonyme")
      .gte("day", landingsSince)
      .then((r) => ((r.data ?? []) as { count: number }[]).reduce((s, l) => s + (Number(l.count) || 0), 0), () => 0),
    getStaffStats(restaurantId).catch(() => null),
    getCatalogGaps(restaurantId).catch(() => []),
    getBudgetStatus(restaurantId).catch(() => null),
    getRestaurantBranding(restaurantId).catch(() => null),
  ]);

  const pending = pendingRows.length;
  const flagged = pendingRows.filter((o) => Array.isArray(o.flag_reasons) && o.flag_reasons.length > 0).length;

  return {
    base: `/admin/${restaurantId}`,
    today,
    receivedByDay: countByDay(recent),
    validatedTotal,
    validatedWindow,
    validatedWeekAgo,
    membersTotal,
    membersWeekAgo,
    hasLogo: !!branding?.logo_url,
    canManage: opts.canManage,
    catalogItemsWithCost,
    landings14d: landings,
    staff: staff === null ? null : staff.map((s) => ({ label: s.label, signups30d: s.signups30d, isActive: s.isActive })),
    todo: { flagged, pending, claims, catalogGaps: catalogGaps.length },
    month: { revenue: budget?.programRevenue ?? 0, rewardsCost: budget?.rewardsCost ?? 0 },
    budgetPct: budget?.budgetPct ?? 0.08,
  };
}
