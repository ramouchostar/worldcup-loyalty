import { test } from "node:test";
import assert from "node:assert/strict";
import { CUISINE_MAX, addCuisineTag, normalizeCuisineTag, suggestCuisineTags } from "./cuisine-tags";

test("Krusty Smash Burgers : Burger d'abord, Smash burger proposé", () => {
  const s = suggestCuisineTags({
    name: "Krusty Smash Burgers",
    category: "Restaurant de hamburgers",
    types: ["hamburger_restaurant", "fast_food_restaurant", "restaurant", "food"],
  });
  assert.deepEqual(s.slice(0, 3), ["Burger", "Snack", "Smash burger"]);
});

test("un sushi sans catégorie parlante : les types de lieu Google suffisent", () => {
  const s = suggestCuisineTags({ name: "Fuji Cuisine", category: "Restaurant", types: ["sushi_restaurant", "japanese_restaurant", "restaurant"] });
  assert.deepEqual(s.slice(0, 2), ["Sushi", "Japonais"]);
});

test("le nom seul aide aussi (saisie à la main)", () => {
  assert.equal(suggestCuisineTags({ name: "Pita Kebab Express" })[0], "Kebab");
});

test("rien de connu : les étiquettes les plus courantes", () => {
  assert.deepEqual(suggestCuisineTags({ name: "Chez Paul" }).slice(0, 2), ["Burger", "Pizza"]);
});

test("une étiquette choisie n'est plus proposée", () => {
  const s = suggestCuisineTags({ name: "Krusty Smash Burgers", types: ["hamburger_restaurant"] }, ["Burger"]);
  assert.ok(!s.includes("Burger"));
  assert.equal(s[0], "Smash burger");
});

test("ajout : catalogue repris, doublons et plafond", () => {
  assert.equal(normalizeCuisineTag("  pizza "), "Pizza");
  assert.equal(normalizeCuisineTag("cuisine du monde"), "Cuisine du monde");
  assert.deepEqual(addCuisineTag(["Pizza"], "PIZZA"), ["Pizza"]);
  const full = ["A", "B", "C", "D", "E"];
  assert.equal(full.length, CUISINE_MAX);
  assert.deepEqual(addCuisineTag(full, "Sushi"), full);
  assert.deepEqual(addCuisineTag([], "   "), []);
});
