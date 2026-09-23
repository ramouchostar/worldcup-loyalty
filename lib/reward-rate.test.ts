import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REWARD_RATE_MAX,
  REWARD_RATE_MIN,
  balanceMultiplier,
  isValidRate,
  pickReferenceItems,
  previewRate,
  rateOptions,
} from "./reward-rate";

test("le choix va de 4 à 12 %, de point en point", () => {
  const options = rateOptions();
  assert.equal(options[0], REWARD_RATE_MIN);
  assert.equal(options[options.length - 1], REWARD_RATE_MAX);
  assert.equal(options.length, 9);
  assert.equal(isValidRate(0.08), true);
  assert.equal(isValidRate(0.02), false);
  assert.equal(isValidRate(0.16), false);
});

test("ce qu'un taux donne, avec les vrais chiffres de Kraainem", () => {
  // Panier moyen 19,02 € → 190 points par ticket ; CA programme du mois 1 226 €
  const items = [
    { name: "Frites Medium", costPrice: 0.24 },
    { name: "Magnifique Beef Menu", costPrice: 4.08 },
  ];
  const a8 = previewRate({ pct: 0.08, avgBasket: 19.02, monthlyProgramRevenue: 1226, items });
  const a4 = previewRate({ pct: 0.04, avgBasket: 19.02, monthlyProgramRevenue: 1226, items });
  assert.equal(a8.items[1].pricePoints, 510);
  assert.equal(a8.items[1].tickets, 3);
  assert.equal(a4.items[1].pricePoints, 1020);
  assert.equal(a4.items[1].tickets, 6); // deux fois plus lent, comme attendu
  assert.equal(a8.monthlyCeiling, 98);
  assert.equal(a4.monthlyCeiling, 49);
});

test("un article au coût inconnu ne figure pas dans l'aperçu", () => {
  const p = previewRate({
    pct: 0.08,
    avgBasket: 20,
    monthlyProgramRevenue: 1000,
    items: [{ name: "Sauce", costPrice: 0 }, { name: "Burger", costPrice: 1 }],
  });
  assert.deepEqual(p.items.map((i) => i.name), ["Burger"]);
});

test("changer de taux déplace les soldes pour que personne ne perde", () => {
  assert.equal(balanceMultiplier(0.08, 0.04), 2); // cadeaux 2× plus chers → soldes ×2
  assert.equal(balanceMultiplier(0.04, 0.08), 0.5); // plus généreux → soldes ÷2
  assert.equal(balanceMultiplier(0.08, 0.08), 1);
  assert.equal(balanceMultiplier(0, 0.08), 1); // taux inconnu : on ne touche à rien
});

test("trois repères : le plus accessible, un milieu, le plus généreux", () => {
  const items = [
    { name: "Sauce", costPrice: 0.1 },
    { name: "Frites", costPrice: 0.24 },
    { name: "Burger", costPrice: 0.94 },
    { name: "Menu", costPrice: 4.08 },
    { name: "Bucket", costPrice: 6.38 },
  ];
  assert.deepEqual(pickReferenceItems(items).map((i) => i.name), ["Sauce", "Burger", "Bucket"]);
  assert.equal(pickReferenceItems(items.slice(0, 2)).length, 2);
});
