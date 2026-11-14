// ADR 0103 §6 — « Ventes par plat » sur toute la caisse : règles PURES (aucune
// base, aucun réseau). Testé dans products.test.ts.
//
// Belpeople donne les QUANTITÉS par plat, par jour et par canal
// (v_agg_products_sold_daily), pas le CA par plat. Comme la page « programme »,
// le CA et la marge sont ESTIMÉS avec les prix et les coûts de la carte : une
// remise ou un prix plus élevé sur une plateforme ne sont pas comptés, et la
// page le dit. Un produit de la caisse sans plat dans la carte n'est jamais
// ignoré en silence : il est compté et listé.

import { baseKey, sizedKey } from "@/lib/menu-quantity";

/** Une ligne lue chez Belpeople : un plat, un jour, un canal. */
export type ProductSaleRow = {
  sales_day: string;
  channel_id: number | null;
  channel_name: string | null;
  product_id: number;
  product_name: string;
  items_sold: number;
};

export type MenuForMatch = { id: string; name: string; menu_price: number; cost_price: number | null };

export type CaisseDish = {
  key: string;
  name: string;
  matched: boolean;
  qty: number;
  /** CA estimé (prix de la carte × quantité) ; null hors carte. */
  revenue: number | null;
  /** Marge estimée ; null hors carte ou sans prix de revient. */
  margin: number | null;
  costMissing: boolean;
};

export type CaisseView = {
  totalItems: number;
  revenue: number;
  margin: number;
  /** Part des articles rattachés à un plat de la carte (0-100), null sans vente. */
  matchedPct: number | null;
  dishes: CaisseDish[];
  channels: { name: string; items: number; pct: number }[];
  unmatched: string[];
  costMissing: string[];
  lastDay: string | null;
};

/** Le plat de la carte d'un produit de la caisse : même nom et même taille, sinon même nom si un seul plat le porte. */
export function matcher(menu: MenuForMatch[]): (productName: string) => MenuForMatch | null {
  const bySized = new Map<string, MenuForMatch>();
  const byBase = new Map<string, MenuForMatch[]>();
  for (const m of menu) {
    if (!bySized.has(sizedKey(m.name))) bySized.set(sizedKey(m.name), m);
    const list = byBase.get(baseKey(m.name)) ?? [];
    list.push(m);
    byBase.set(baseKey(m.name), list);
  }
  return (name) => {
    const exact = bySized.get(sizedKey(name));
    if (exact) return exact;
    const sameBase = byBase.get(baseKey(name)) ?? [];
    // Plusieurs tailles possibles (« Nugget (4) », « Nugget (8) ») : on ne devine pas.
    return sameBase.length === 1 ? sameBase[0] : null;
  };
}

/** Un nom de canal lisible : « UBER EATS » → « Uber Eats ». */
export function channelLabel(name: string | null): string {
  const s = (name ?? "").trim();
  if (!s) return "Autre";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildCaisseView(rows: ProductSaleRow[], menu: MenuForMatch[]): CaisseView {
  const match = matcher(menu);
  const dishes = new Map<string, CaisseDish>();
  const channels = new Map<string, number>();
  const unmatched = new Set<string>();
  let lastDay: string | null = null;

  for (const r of rows) {
    const qty = Number(r.items_sold) || 0;
    if (qty <= 0) continue;
    if (!lastDay || r.sales_day > lastDay) lastDay = r.sales_day;
    const ch = channelLabel(r.channel_name);
    channels.set(ch, (channels.get(ch) ?? 0) + qty);

    const mi = match(r.product_name);
    const key = mi ? `m:${mi.id}` : `p:${baseKey(r.product_name)}`;
    const d =
      dishes.get(key) ??
      ({
        key,
        name: mi ? mi.name : r.product_name.trim(),
        matched: !!mi,
        qty: 0,
        revenue: mi ? 0 : null,
        margin: mi && mi.cost_price != null ? 0 : null,
        costMissing: !!mi && mi.cost_price == null,
      } satisfies CaisseDish);
    d.qty += qty;
    if (mi) {
      d.revenue = (d.revenue ?? 0) + Number(mi.menu_price) * qty;
      if (mi.cost_price != null) d.margin = (d.margin ?? 0) + (Number(mi.menu_price) - Number(mi.cost_price)) * qty;
    } else {
      unmatched.add(r.product_name.trim());
    }
    dishes.set(key, d);
  }

  const list = [...dishes.values()].sort(
    (a, b) => (b.margin ?? -1) - (a.margin ?? -1) || (b.revenue ?? -1) - (a.revenue ?? -1) || b.qty - a.qty,
  );
  const totalItems = list.reduce((s, d) => s + d.qty, 0);
  const matchedItems = list.filter((d) => d.matched).reduce((s, d) => s + d.qty, 0);
  const chList = [...channels.entries()]
    .map(([name, items]) => ({ name, items, pct: totalItems > 0 ? Math.round((items / totalItems) * 100) : 0 }))
    .sort((a, b) => b.items - a.items);

  return {
    totalItems,
    revenue: round2(list.reduce((s, d) => s + (d.revenue ?? 0), 0)),
    margin: round2(list.reduce((s, d) => s + (d.margin ?? 0), 0)),
    matchedPct: totalItems > 0 ? Math.round((matchedItems / totalItems) * 100) : null,
    dishes: list,
    channels: chList,
    unmatched: [...unmatched].sort((a, b) => a.localeCompare(b, "fr")),
    costMissing: list.filter((d) => d.costMissing).map((d) => d.name),
    lastDay,
  };
}

/** Part des articles achetés par les clients du programme (0-100), bornée : les deux sources ne se recoupent pas au plat près. */
export function programSharePct(programItems: number, caisseItems: number): number | null {
  if (caisseItems <= 0) return null;
  return Math.min(100, Math.round((programItems / caisseItems) * 100));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
