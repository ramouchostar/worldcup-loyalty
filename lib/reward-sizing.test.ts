import { test } from "node:test";
import assert from "node:assert/strict";
import { saverCostCap, suggestSaverBands } from "./reward-sizing";
import { pointsForOrder } from "./points-model";

// ADR 0060 — la réserve en points courbés. Les valeurs attendues sont celles
// que la migration 20260914-1932 produit en SQL : les deux doivent rester
// alignées.

test("réserve : un ticket moyen de Kraainem (18,86 €) vaut 43 points courbés", () => {
  assert.equal(pointsForOrder(18.86), 43);
});

test("réserve : paliers ≈ 4, 8 et 12 tickets moyens, arrondis à 5", () => {
  assert.deepEqual(suggestSaverBands(18.86), [170, 345, 515]);
  // sans historique, panier par défaut de 25 € → 48 points par ticket
  assert.deepEqual(suggestSaverBands(0), [190, 385, 575]);
});

test("réserve : le plafond de coût suit les tickets moyens que le seuil représente", () => {
  // 4 tickets moyens pile → 4 × 18,86 € × 8 %
  assert.ok(Math.abs(saverCostCap(4 * 43, 18.86) - 4 * 18.86 * 0.08) < 1e-9);
  // palier arrondi de Kraainem
  assert.ok(Math.abs(saverCostCap(170, 18.86) - 5.965) < 0.01);
  assert.ok(Math.abs(saverCostCap(515, 18.86) - 18.07) < 0.01);
});

test("réserve : le plafond ne dépend plus d'un taux 1 point = 1 €", () => {
  // l'ancien plafond (seuil × 8 %) donnait 13,60 € pour 170 : trois fois trop
  assert.ok(saverCostCap(170, 18.86) < 170 * 0.08 / 2);
});
