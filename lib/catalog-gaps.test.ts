import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateGaps } from "./catalog-gaps";

test("aggregateGaps : seuil de récurrence (≥ 2 tickets distincts)", () => {
  const gaps = aggregateGaps([
    { order_id: "o1", raw_name: "BelTacos Nuggets (Tacos) + Andalouse", unit_price: 8.5, order_date: "2026-08-20" },
    { order_id: "o2", raw_name: "BelTacos Nuggets (Tacos) + Samourai", unit_price: 9.5, order_date: "2026-08-25" },
    { order_id: "o3", raw_name: "Minion Burger Menu (Medium Fries) + Oasis Tropical", unit_price: 7.9, order_date: "2026-08-26" },
  ]);
  assert.equal(gaps.length, 1); // Minion : un seul ticket → pas encore un trou
  assert.equal(gaps[0].label, "BelTacos Nuggets");
  assert.equal(gaps[0].orders, 2);
  assert.equal(gaps[0].suggestedPrice, 9.5); // médiane haute de [8.5, 9.5]
  assert.equal(gaps[0].oldestOrderDate, "2026-08-20");
});

test("aggregateGaps : deux occurrences sur le MÊME ticket ne comptent qu'un ordre", () => {
  const gaps = aggregateGaps([
    { order_id: "o1", raw_name: "BelTacos Nuggets (Tacos)", unit_price: 8.5 },
    { order_id: "o1", raw_name: "BelTacos Nuggets (Tacos)", unit_price: 8.5 },
  ]);
  assert.equal(gaps.length, 0);
});

test("aggregateGaps : le libellé garde la casse et les tailles chiffrées", () => {
  const gaps = aggregateGaps([
    { order_id: "o1", raw_name: "Mega Box (8)", unit_price: 12 },
    { order_id: "o2", raw_name: "Mega Box (8)", unit_price: 12 },
  ]);
  assert.equal(gaps[0].label, "Mega Box (8)"); // (8) = taille, conservée
});
