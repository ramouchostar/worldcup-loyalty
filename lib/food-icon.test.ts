import { test } from "node:test";
import assert from "node:assert/strict";
import { foodIconCodepoint, GIFT_FALLBACK_CODEPOINT } from "./food-icon";

// Noms RÉELS du catalogue et des grilles Kraainem — le mapping doit tenir
// sur le terrain, pas sur des exemples inventés.
test("plats Kraainem : chaque famille trouve son illustration", () => {
  assert.equal(foodIconCodepoint("Finest Burger"), "1f354");
  assert.equal(foodIconCodepoint("Extreme Beef Menu"), "1f354");
  assert.equal(foodIconCodepoint("Fries (Medium)"), "1f35f");
  assert.equal(foodIconCodepoint("Bucket for 2"), "1f357");
  assert.equal(foodIconCodepoint("Duo Bucket"), "1f357");
  assert.equal(foodIconCodepoint("Nuggets Menu"), "1f357");
  assert.equal(foodIconCodepoint("12 Churros"), "1f9c7");
  assert.equal(foodIconCodepoint("Kebab Wrap"), "1f32f");
  assert.equal(foodIconCodepoint("Pepsi Max"), "1f964");
  assert.equal(foodIconCodepoint("Oasis Tropical"), "1f964");
});

test("priorité : la catégorie spécifique bat la générique", () => {
  // Un BelTacos Tenders est un taco avant d'être du poulet.
  assert.equal(foodIconCodepoint("BelTacos Tenders"), "1f32e");
  // Un wrap au poulet reste un wrap.
  assert.equal(foodIconCodepoint("Chicken Kebab Wrap"), "1f32f");
});

test("accents et casse indifférents", () => {
  assert.equal(foodIconCodepoint("PÂTES bolognaise"), "1f35d");
  assert.equal(foodIconCodepoint("Salade César"), "1f957");
  assert.equal(foodIconCodepoint("GAUFRE de Bruxelles"), "1f9c7");
});

test("inconnu, vide ou null → cadeau générique, jamais un contresens", () => {
  assert.equal(foodIconCodepoint("Cadeau surprise"), GIFT_FALLBACK_CODEPOINT);
  assert.equal(foodIconCodepoint("Finest"), GIFT_FALLBACK_CODEPOINT); // marque seule, pas de famille
  assert.equal(foodIconCodepoint(""), GIFT_FALLBACK_CODEPOINT);
  assert.equal(foodIconCodepoint(null), GIFT_FALLBACK_CODEPOINT);
  assert.equal(foodIconCodepoint(undefined), GIFT_FALLBACK_CODEPOINT);
});
