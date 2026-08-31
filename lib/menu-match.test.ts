import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeItemName,
  canonicalizeTicketLabel,
  isTechnicalLine,
  buildTicketMatcher,
} from "./menu-match";

// Catalogue façon kraainem (extrait) + alias du seed de la migration
// 20260831-2335. Les libellés testés sont les VRAIS libellés non rattachés
// mesurés sur les tickets kraainem (diagnostic 2026-08-31, 38/46 lignes).
const CATALOG = [
  { id: "finest", name: "Finest" },
  { id: "smoky", name: "Smoky" },
  { id: "smoky-menu", name: "Smoky Menu" },
  { id: "frites-m", name: "Frites Medium" },
  { id: "frites-l", name: "Frites Large" },
  { id: "pepsi-max", name: "Pepsi Max" },
  { id: "mayo", name: "Mayonnaise" },
  { id: "boneless", name: "Boneless Bucket" },
  { id: "oasis", name: "Oasis Pomme" },
  { id: "nugget-16", name: "Nugget (16)" },
  { id: "sweet-chili", name: "Sweet Chili" },
];
const ALIASES = [
  { alias: "fries medium", menu_item_id: "frites-m" },
  { alias: "fries large", menu_item_id: "frites-l" },
  { alias: "drinkvatadjustment", menu_item_id: null },
];

const match = buildTicketMatcher(CATALOG, ALIASES);

test("suffixe de catégorie de la caisse → article du catalogue", () => {
  assert.equal(match("Finest (Burger)").menuItemId, "finest");
  assert.equal(match("Smoky (Burger)").menuItemId, "smoky");
  assert.equal(match("Pepsi Max (Drink)").menuItemId, "pepsi-max");
  assert.equal(match("Mayonnaise (Sauce)").menuItemId, "mayo");
  assert.equal(match("Boneless Bucket (Bucket)").menuItemId, "boneless");
  assert.equal(match("Oasis Pomme (Drink)").menuItemId, "oasis");
});

test("libellés EN → alias FR ; la taille n'est pas perdue", () => {
  assert.equal(match("Fries (Medium)").menuItemId, "frites-m");
  assert.equal(match("Fries (Large)").menuItemId, "frites-l");
});

test("compositions « + » → l'article principal", () => {
  assert.equal(match("Smoky Menu (Medium Fries) + Pepsi + Sweet Chilli").menuItemId, "smoky-menu");
  assert.equal(match("Smoky (Burger) + 4pc. Chilli Cheese").menuItemId, "smoky");
});

test("lignes techniques → ignorées, jamais un plat", () => {
  assert.deepEqual(match("DrinkVATAdjustment"), { menuItemId: null, ignored: true });
  assert.deepEqual(match("DrinkVATAdjustment (Drink)"), { menuItemId: null, ignored: true });
  // même sans alias : le motif technique suffit
  const noAlias = buildTicketMatcher(CATALOG, []);
  assert.equal(noAlias("DrinkVATAdjustment").ignored, true);
  assert.equal(isTechnicalLine(normalizeItemName("Remise fidélité")), true);
});

test("produits réellement absents → NULL non ignoré (boucle de complétion)", () => {
  assert.deepEqual(match("BelTacos Nuggets (Tacos) + Andalouse"), { menuItemId: null, ignored: false });
  assert.deepEqual(match("Minion Burger Menu (Medium Fries) + Oasis Tropical + Andalouse"), { menuItemId: null, ignored: false });
  assert.deepEqual(match("Kebab Wrap (Wrap)"), { menuItemId: null, ignored: false });
});

test("les parenthèses AVEC chiffre (tailles du catalogue) sont conservées", () => {
  assert.equal(match("Nugget (16)").menuItemId, "nugget-16");
  assert.equal(canonicalizeTicketLabel("Nugget (16)"), "nugget 16");
});

test("équivalence de graphie chilli/chili, symétrique", () => {
  assert.equal(normalizeItemName("Sweet Chilli"), normalizeItemName("Sweet Chili"));
  assert.equal(match("Sweet Chilli (Sauce)").menuItemId, "sweet-chili");
});
