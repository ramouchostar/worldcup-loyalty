import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE_BUDGET_PCT,
  PERSONAL_POINTS_PER_EURO,
  catalogPricePoints,
  catalogueView,
  personalPointsForOrder,
  type CatalogueItem,
} from "./catalogue";

test("10 points par euro, proportionnels (ADR 0061 §1)", () => {
  assert.equal(PERSONAL_POINTS_PER_EURO, 10);
  assert.equal(personalPointsForOrder(18.44), 184);
  assert.equal(personalPointsForOrder(2.5), 25);
  assert.equal(personalPointsForOrder(55.3), 553);
  // proportionnel : deux fois le ticket, deux fois les points
  assert.equal(personalPointsForOrder(40), 2 * personalPointsForOrder(20));
});

test("montant absent, nul ou illisible : aucun point", () => {
  assert.equal(personalPointsForOrder(0), 0);
  assert.equal(personalPointsForOrder(-5), 0);
  assert.equal(personalPointsForOrder(Number.NaN), 0);
});

test("prix en points calculé depuis le prix de revient, arrondi au 5 supérieur", () => {
  assert.equal(CATALOGUE_BUDGET_PCT, 0.08);
  assert.equal(catalogPricePoints(4.33), 545); // Wings (16)
  assert.equal(catalogPricePoints(0.25), 35); // Frites Medium — 31,25 → 35
  assert.equal(catalogPricePoints(8.8), 1100); // Tenders (16)
  assert.equal(catalogPricePoints(2.2), 275); // Tenders (4), pile sur un multiple de 5
});

test("le prix tient les 8 % : son coût ne dépasse jamais 8 % des dépenses qui l'ont payé", () => {
  for (const cost of [0.13, 0.25, 0.31, 1.07, 2.08, 4.33, 6.38, 8.8, 12.79]) {
    const price = catalogPricePoints(cost)!;
    const spendEur = price / PERSONAL_POINTS_PER_EURO;
    assert.ok(cost <= spendEur * CATALOGUE_BUDGET_PCT + 1e-9, `${cost} € pour ${price} points`);
  }
});

test("hors catalogue : coût inconnu ou nul", () => {
  assert.equal(catalogPricePoints(null), null);
  assert.equal(catalogPricePoints(undefined), null);
  assert.equal(catalogPricePoints(0), null);
});

const item = (id: string, pricePoints: number): CatalogueItem => ({ id, name: id, imagePath: null, pricePoints });
const CATALOGUE = [item("Tenders (16)", 1100), item("Frites", 35), item("Wings (16)", 545), item("Nuggets (16)", 260)];

test("« tu peux déjà avoir » : l'article le plus généreux à portée", () => {
  const v = catalogueView(600, CATALOGUE);
  assert.equal(v.reachable?.id, "Wings (16)");
  assert.equal(v.next?.id, "Tenders (16)");
  assert.equal(v.missing, 500);
  assert.equal(v.pct, 55);
});

test("« plus que N points » : rien encore à portée", () => {
  const v = catalogueView(20, CATALOGUE);
  assert.equal(v.reachable, null);
  assert.equal(v.next?.id, "Frites");
  assert.equal(v.missing, 15);
});

test("tout est à portée : pas de suivant, barre pleine", () => {
  const v = catalogueView(5000, CATALOGUE);
  assert.equal(v.reachable?.id, "Tenders (16)");
  assert.equal(v.next, null);
  assert.equal(v.missing, 0);
  assert.equal(v.pct, 100);
});

test("solde négatif ou catalogue vide : rien ne casse", () => {
  assert.deepEqual(catalogueView(-10, []), { reachable: null, next: null, missing: 0, pct: 100 });
  assert.equal(catalogueView(-10, CATALOGUE).next?.id, "Frites");
});
