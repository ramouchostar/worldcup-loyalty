import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaisseView, channelLabel, matcher, programSharePct, type MenuForMatch, type ProductSaleRow } from "./products";

const MENU: MenuForMatch[] = [
  { id: "a", name: "Smoky Menu", menu_price: 11.9, cost_price: 4.4 },
  { id: "b", name: "Curry", menu_price: 0.8, cost_price: 0.1 },
  { id: "c", name: "Nugget (4)", menu_price: 4.5, cost_price: 1.2 },
  { id: "d", name: "Nugget (8)", menu_price: 7.5, cost_price: 2.2 },
  { id: "e", name: "Tiramisu", menu_price: 3.5, cost_price: null },
];

const row = (product_name: string, items_sold: number, channel_name = "Intake module", sales_day = "2026-11-08"): ProductSaleRow => ({
  sales_day,
  channel_id: 29,
  channel_name,
  product_id: 1,
  product_name,
  items_sold,
});

test("un produit de la caisse retrouve son plat : même nom et même taille", () => {
  const m = matcher(MENU);
  assert.equal(m("Smoky Menu")?.id, "a");
  assert.equal(m("Nuggets (4PC.)")?.id, "c");
  assert.equal(m("curry")?.id, "b");
});

test("une taille absente n'est jamais devinée entre plusieurs tailles", () => {
  assert.equal(matcher(MENU)("Nuggets"), null);
});

test("CA et marge estimés avec la carte ; hors carte et coût manquant sont dits", () => {
  const v = buildCaisseView([row("Smoky Menu", 10), row("Smoky Menu", 5, "UBER EATS"), row("Tiramisu", 4), row("Sauce offerte", 3)], MENU);
  assert.equal(v.totalItems, 22);
  assert.equal(v.revenue, 192.5); // 15 × 11,9 + 4 × 3,5
  assert.equal(v.margin, 112.5); // 15 × 7,5 ; Tiramisu sans coût : aucune marge inventée
  assert.equal(v.matchedPct, 86); // 19 / 22
  assert.deepEqual(v.unmatched, ["Sauce offerte"]);
  assert.deepEqual(v.costMissing, ["Tiramisu"]);
  assert.equal(v.dishes[0].name, "Smoky Menu");
  assert.deepEqual(v.channels.map((c) => c.name), ["Intake Module", "Uber Eats"]);
});

test("une ligne à 0 article ne compte pas et le dernier jour lu est gardé", () => {
  const v = buildCaisseView([row("Curry", 0, "x", "2026-11-12"), row("Curry", 2, "x", "2026-11-07")], MENU);
  assert.equal(v.totalItems, 2);
  assert.equal(v.lastDay, "2026-11-07");
});

test("noms de canaux lisibles, et part du programme bornée", () => {
  assert.equal(channelLabel("UBER EATS"), "Uber Eats");
  assert.equal(channelLabel(null), "Autre");
  assert.equal(programSharePct(64, 3000), 2);
  assert.equal(programSharePct(5, 3), 100);
  assert.equal(programSharePct(5, 0), null);
});

import { totalsReliable } from "./products";

test("les totaux estimés ne sont montrés qu'à 90 % d'articles reconnus", () => {
  assert.equal(totalsReliable({ matchedPct: 47 }), false); // Kraainem au 2026-11-14
  assert.equal(totalsReliable({ matchedPct: 90 }), true);
  assert.equal(totalsReliable({ matchedPct: null }), false);
});
