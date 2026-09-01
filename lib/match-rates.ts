// ADR 0046, lot 5 — verrou plateforme : taux de rattachement catalogue ↔
// tickets par établissement. Un resto sous le seuil a des « ventes par plat »
// mensongères — on veut le voir sur /platform/scans AVANT que le restaurateur
// ne s'en plaigne. Lecture seule, fail-open.

import { createAdminClient } from "./supabase";

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
    const { data: orders } = await admin
      .from("orders")
      .select("id, restaurant_id")
      .gte("order_date", since)
      .limit(20000);
    const orderList = (orders ?? []) as { id: string; restaurant_id: string }[];
    const restoByOrder = new Map(orderList.map((o) => [o.id, o.restaurant_id]));
    const ids = orderList.map((o) => o.id);

    type Acc = { total: number; matched: number; ignored: number };
    const byResto = new Map<string, Acc>();
    type Row = { order_id: string; menu_item_id: string | null; is_ignored?: boolean | null };
    for (let i = 0; i < ids.length; i += 150) {
      const slice = ids.slice(i, i + 150);
      const withFlag = await admin.from("order_items").select("order_id, menu_item_id, is_ignored").in("order_id", slice);
      let rows: Row[];
      if (withFlag.error) {
        const bare = await admin.from("order_items").select("order_id, menu_item_id").in("order_id", slice);
        rows = (bare.data ?? []) as Row[];
      } else {
        rows = (withFlag.data ?? []) as Row[];
      }
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
  } catch {
    return [];
  }
}
