// ADR 0046, lot 4 — Boucle de complétion du catalogue.
//
// Un « trou » = un libellé de ticket que même le matcher actuel (alias +
// canonisation) ne sait pas rattacher, vu sur au moins GAP_MIN_ORDERS tickets
// distincts (seuil validé par le porteur, 2026-08-31 : une lecture OCR ratée
// isolée ne doit jamais déranger le restaurateur). Le prix de vente est
// suggéré depuis les tickets eux-mêmes (médiane des unit_price lus) : dans la
// plupart des cas il ne reste que le prix de revient à saisir.

import { createAdminClient } from "./supabase";
import { getMenuAliases } from "./menu-aliases";
import { buildTicketMatcher, canonicalizeTicketLabel } from "./menu-match";
import { baseKey, mainTicketLabel, parseSizedName, sizedKey } from "./menu-quantity";

export const GAP_MIN_ORDERS = 2;

/**
 * De quoi il s'agit vraiment (ADR 0067) :
 *  - `dish` : un plat que la carte ne connaît pas du tout ;
 *  - `size` : un plat CONNU dans une taille absente de la carte (« Nuggets
 *    (3PC) » alors qu'elle a 1, 4, 8 et 16). Ce n'est PAS un article :
 *    c'est n fois l'unité (décision du porteur, 2026-09-23). Jamais suggéré
 *    au restaurateur — la carte garde ses tailles, la ligne compte en unités.
 */
export type CatalogGapKind = "dish" | "size";

export type CatalogGap = {
  /** Libellé proposé pour le catalogue (brut le plus fréquent, nettoyé, casse conservée). */
  label: string;
  /** Un libellé brut d'origine, pour que le restaurateur reconnaisse son ticket. */
  rawSample: string;
  /** Clé canonisée — c'est elle que le geste du formulaire pose en alias. */
  normalized: string;
  orders: number;
  occurrences: number;
  suggestedPrice: number | null;
  oldestOrderDate: string | null;
  kind: CatalogGapKind;
  /** Pour une taille manquante : les articles de la carte du même plat. */
  family: string[];
};

export type GapLine = {
  order_id: string;
  raw_name: string;
  unit_price: number | null;
  order_date?: string | null;
};

/** Agrégation pure (testable) des lignes non rattachées → trous récurrents. */
export function aggregateGaps(
  lines: GapLine[],
  minOrders = GAP_MIN_ORDERS,
  menuNames: string[] = []
): CatalogGap[] {
  // Plats connus de la carte, par nom sans taille : « Nugget (4) »,
  // « Nugget (8) »… forment la famille « nugget ».
  const familiesByBase = new Map<string, string[]>();
  for (const name of menuNames) {
    const key = baseKey(name);
    if (key === "") continue;
    familiesByBase.set(key, [...(familiesByBase.get(key) ?? []), name]);
  }
  type Acc = {
    raws: Map<string, number>;
    orders: Set<string>;
    prices: number[];
    occurrences: number;
    oldest: string | null;
  };
  const byKey = new Map<string, Acc>();
  for (const l of lines) {
    // Regroupement par plat + taille (ADR 0067) : « BelTacos Nuggets » et
    // « Bel Tacos Nuggets » ne font plus deux suggestions ; « Nuggets (4PC.) »
    // rejoint la taille 4.
    const key = sizedKey(mainTicketLabel(l.raw_name)) || canonicalizeTicketLabel(l.raw_name);
    if (key === "") continue;
    const g: Acc = byKey.get(key) ?? { raws: new Map(), orders: new Set(), prices: [], occurrences: 0, oldest: null };
    g.occurrences++;
    g.orders.add(l.order_id);
    g.raws.set(l.raw_name, (g.raws.get(l.raw_name) ?? 0) + 1);
    const p = Number(l.unit_price);
    if (Number.isFinite(p) && p > 0) g.prices.push(p);
    if (l.order_date && (!g.oldest || l.order_date < g.oldest)) g.oldest = l.order_date;
    byKey.set(key, g);
  }

  const out: CatalogGap[] = [];
  for (const [normalized, g] of byKey) {
    if (g.orders.size < minOrders) continue;
    const rawSample = [...g.raws.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // Libellé proposé = l'article principal du brut, casse d'origine gardée
    // (ADR 0067 : même extraction que le rattachement, crochets compris).
    const label = mainTicketLabel(rawSample);
    const prices = [...g.prices].sort((a, b) => a - b);
    const suggestedPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null;
    // Plat connu dans une taille inconnue ? Alors ce n'est pas un nouveau plat.
    const parsed = parseSizedName(label || rawSample);
    const family = parsed.size != null ? (familiesByBase.get(baseKey(label || rawSample)) ?? []) : [];
    out.push({
      kind: family.length > 0 ? "size" : "dish",
      family,
      label: label || rawSample,
      rawSample,
      normalized,
      orders: g.orders.size,
      occurrences: g.occurrences,
      suggestedPrice,
      oldestOrderDate: g.oldest,
    });
  }
  // Une déclinaison de quantité n'est jamais proposée : « 3 nuggets », ce
  // n'est pas un article (ADR 0067).
  return out
    .filter((gap) => gap.kind === "dish")
    .sort((a, b) => b.orders - a.orders || b.occurrences - a.occurrences);
}

/** Trous récurrents d'un resto. Fail-open : toute erreur → liste vide. */
export async function getCatalogGaps(restaurantId: string, minOrders = GAP_MIN_ORDERS): Promise<CatalogGap[]> {
  try {
    const admin = createAdminClient();
    const [{ data: menu }, aliases, { data: orders }] = await Promise.all([
      admin.from("menu_items").select("id, name").eq("restaurant_id", restaurantId),
      getMenuAliases(restaurantId),
      admin.from("orders").select("id, order_date").eq("restaurant_id", restaurantId),
    ]);
    const match = buildTicketMatcher((menu ?? []) as { id: string; name: string }[], aliases);
    const orderList = (orders ?? []) as { id: string; order_date: string | null }[];
    const dateById = new Map(orderList.map((o) => [o.id, o.order_date ?? null]));
    const ids = orderList.map((o) => o.id);

    const lines: GapLine[] = [];
    type Row = { order_id: string; raw_name: string; unit_price: number | null; is_ignored?: boolean | null };
    for (let i = 0; i < ids.length; i += 150) {
      const slice = ids.slice(i, i + 150);
      const withFlag = await admin
        .from("order_items")
        .select("order_id, raw_name, unit_price, is_ignored")
        .in("order_id", slice)
        .is("menu_item_id", null);
      let rows: Row[];
      if (withFlag.error) {
        const bare = await admin
          .from("order_items")
          .select("order_id, raw_name, unit_price")
          .in("order_id", slice)
          .is("menu_item_id", null);
        rows = (bare.data ?? []) as Row[];
      } else {
        rows = (withFlag.data ?? []) as Row[];
      }
      for (const r of rows) {
        if (r.is_ignored) continue;
        // Une ligne que le matcher ACTUEL sait résoudre n'est pas un trou :
        // elle sera reprise au prochain rétro-rattachement.
        const m = match(r.raw_name);
        if (m.menuItemId || m.ignored) continue;
        lines.push({ order_id: r.order_id, raw_name: r.raw_name, unit_price: r.unit_price, order_date: dateById.get(r.order_id) });
      }
    }
    const menuNames = ((menu ?? []) as { name: string }[]).map((m) => m.name);
    return aggregateGaps(lines, minOrders, menuNames);
  } catch {
    return [];
  }
}
