// ADR 0046, lot 5 — verrou plateforme : taux de rattachement catalogue ↔
// tickets par établissement. Un resto sous le seuil a des « ventes par plat »
// mensongères — on veut le voir sur /platform/scans AVANT que le restaurateur
// ne s'en plaigne. Lecture seule, fail-open.

import { createAdminClient } from "./supabase";
import { fetchAllRowsStrict } from "./paged-select";

export const MATCH_RATE_ALERT_PCT = 60;
export const MATCH_RATE_MIN_LINES = 10; // sous ça, un % n'a pas de sens

export type RestaurantMatchRate = {
  restaurantId: string;
  name: string;
  total: number;   // lignes de tickets, lignes techniques ignorées exclues
  matched: number;
  ignored: number;
  rate: number;    // % rattaché (0-100)
};

export async function getMatchRates(days = 60): Promise<RestaurantMatchRate[]> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    // Lecture PAGINÉE : PostgREST tronque en silence à 1 000 lignes (lib/paged-select.ts), et un
    // taux de rattachement calculé sur un échantillon cacherait justement les restos à problème.
    const orderList = await fetchAllRowsStrict<{ id: string; restaurant_id: string }>(
      "Taux de rattachement : tickets",
      (from, to) =>
        admin
          .from("orders")
          .select("id, restaurant_id")
          .gte("order_date", since)
          .order("id")
          .range(from, to)
    );
    const restoByOrder = new Map(orderList.map((o) => [o.id, o.restaurant_id]));
    const ids = orderList.map((o) => o.id);

    type Acc = { total: number; matched: number; ignored: number };
    const byResto = new Map<string, Acc>();
    type Row = { order_id: string; menu_item_id: string | null; is_ignored?: boolean | null };
    // Lots de 150 tickets, six lots à la fois : la lecture est maintenant COMPLÈTE, donc plus
    // longue qu'avec l'ancien plafond silencieux — on la parallélise un peu.
    const readLots = async (slice: string[]): Promise<Row[]> => {
      const withFlag = await admin.from("order_items").select("order_id, menu_item_id, is_ignored").in("order_id", slice);
      if (!withFlag.error) return (withFlag.data ?? []) as Row[];
      const bare = await admin.from("order_items").select("order_id, menu_item_id").in("order_id", slice);
      return (bare.data ?? []) as Row[];
    };
    const lots: string[][] = [];
    for (let i = 0; i < ids.length; i += 150) lots.push(ids.slice(i, i + 150));
    for (let i = 0; i < lots.length; i += 6) {
      const batches = await Promise.all(lots.slice(i, i + 6).map(readLots));
      for (const rows of batches) {
        for (const r of rows) {
          const resto = restoByOrder.get(r.order_id);
          if (!resto) continue;
          const acc: Acc = byResto.get(resto) ?? { total: 0, matched: 0, ignored: 0 };
          if (r.is_ignored) acc.ignored++;
          else {
            acc.total++;
            if (r.menu_item_id) acc.matched++;
          }
          byResto.set(resto, acc);
        }
      }
    }
    if (byResto.size === 0) return [];

    const { data: restos } = await admin
      .from("restaurants")
      .select("id, name")
      .in("id", [...byResto.keys()]);
    const nameById = new Map(((restos ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));

    return [...byResto.entries()]
      .filter(([, a]) => a.total > 0)
      .map(([restaurantId, a]) => ({
        restaurantId,
        name: nameById.get(restaurantId) ?? restaurantId,
        total: a.total,
        matched: a.matched,
        ignored: a.ignored,
        rate: Math.round((a.matched / a.total) * 100),
      }))
      .sort((a, b) => a.rate - b.rate || b.total - a.total);
  } catch (e) {
    // Fail-open (la page plateforme ne casse pas), mais jamais en silence.
    console.error("[match-rates]", (e as Error).message);
    return [];
  }
}
