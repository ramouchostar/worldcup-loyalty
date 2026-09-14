import { test } from "node:test";
import assert from "node:assert/strict";
import { fitsSaverCap, saverBandView, saverBandsFor, suggestSaverGifts } from "./reserve-tiers-view";

// Valeurs réelles de Kraainem au 2026-09-14 : panier moyen 18,86 €,
// gros cadeaux 170 / 345 / 515 points (migration 20260914-2010).

test("seuils : ceux enregistrés passent avant le calcul", () => {
  assert.deepEqual(saverBandsFor([515, 170, 345, 170], 18.86), [170, 345, 515]);
});

test("seuils : sans rien d'enregistré, ≈ 4 / 8 / 12 tickets moyens", () => {
  assert.deepEqual(saverBandsFor([], 18.86), [170, 345, 515]);
});

test("vue d'un seuil : tickets moyens et plafond de coût", () => {
  const v = saverBandView(170, 18.86);
  assert.equal(v.tickets, 4);
  assert.ok(Math.abs(v.costCap - 5.965) < 0.01);
  assert.equal(saverBandView(515, 18.86).tickets, 12);
});

test("plafond : coût inconnu, nul ou trop élevé → article refusé", () => {
  assert.equal(fitsSaverCap({ cost_price: 4.4 }, 5.97), true);
  assert.equal(fitsSaverCap({ cost_price: 6.38 }, 5.97), false);
  assert.equal(fitsSaverCap({ cost_price: null }, 5.97), false);
  assert.equal(fitsSaverCap({ cost_price: 0 }, 5.97), false);
});

test("suggestion : l'article le plus généreux sous chaque plafond", () => {
  const catalogue = [
    { id: "tenders", name: "Tenders (16)", menu_price: 14, cost_price: 4.4 },
    { id: "friends", name: "Friends Bucket", menu_price: 22, cost_price: 6.38 },
    { id: "family", name: "Family Bucket", menu_price: 35, cost_price: 12.79 },
    { id: "frites", name: "Frites", menu_price: 3, cost_price: 0.24 },
  ];
  const picks = suggestSaverGifts([170, 345, 515], catalogue, 18.86).map((p) => p.item?.id ?? null);
  assert.deepEqual(picks, ["tenders", "friends", "family"]);
  // aucun article sous le plafond → pas de suggestion
  assert.equal(suggestSaverGifts([5], catalogue, 18.86)[0].item, null);
});
