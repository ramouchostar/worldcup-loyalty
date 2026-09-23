import { test } from "node:test";
import assert from "node:assert/strict";
import { baseKey, displayItemName, mainTicketLabel, parseSizedName, sizedKey } from "./menu-quantity";

test("la taille se lit quelle que soit l'écriture de la caisse", () => {
  assert.deepEqual(parseSizedName("Nugget (4)"), { base: "Nugget", size: 4 });
  assert.deepEqual(parseSizedName("Nuggets (4PC.)"), { base: "Nuggets", size: 4 });
  assert.deepEqual(parseSizedName("Nuggets (3PC)"), { base: "Nuggets", size: 3 });
  assert.deepEqual(parseSizedName("3pc Mozzarella Sticks"), { base: "Mozzarella Sticks", size: 3 });
  assert.deepEqual(parseSizedName("Wings x4"), { base: "Wings", size: 4 });
  assert.deepEqual(parseSizedName("Churros (12)"), { base: "Churros", size: 12 });
});

test("un plat sans taille reste intact", () => {
  assert.deepEqual(parseSizedName("Finest Burger"), { base: "Finest Burger", size: null });
  assert.deepEqual(parseSizedName("Magnifique Beef Menu"), { base: "Magnifique Beef Menu", size: null });
  // Un chiffre collé au nom n'est pas une taille
  assert.deepEqual(parseSizedName("7up"), { base: "7up", size: null });
  // « 1664 Blanche » : le nombre fait partie du nom, la taille reste nulle si le reste est court
  assert.equal(parseSizedName("1664 Blanche").size, 1664 > 999 ? null : 1664);
});

test("le ticket et la carte se rejoignent malgré le pluriel et l'écriture", () => {
  // Terrain Kraainem : ces deux-là ne se rattachaient pas
  assert.equal(sizedKey("Nuggets (4PC.)"), sizedKey("Nugget (4)"));
  assert.equal(sizedKey("Wings (4PC.)"), sizedKey("Wings (4)"));
  // Les espaces et la casse ne séparent plus deux fois le même plat
  assert.equal(baseKey("BelTacos Nuggets"), baseKey("Bel Tacos Nuggets"));
  // Deux tailles différentes restent deux articles différents
  assert.notEqual(sizedKey("Nugget (4)"), sizedKey("Nugget (8)"));
  // Une taille absente de la carte ne se confond pas avec une autre
  assert.notEqual(sizedKey("Nuggets (3PC)"), sizedKey("Nugget (4)"));
});

test("côté client, la taille passe devant", () => {
  assert.equal(displayItemName("Churros (6)"), "6 Churros");
  assert.equal(displayItemName("Nugget (4)"), "4 Nuggets");
  assert.equal(displayItemName("Tenders (16)"), "16 Tenders");
  assert.equal(displayItemName("Hot stripes (1)"), "1 Hot stripes");
  assert.equal(displayItemName("Mozzarella Sticks (3)"), "3 Mozzarella Sticks");
  // Sans taille, rien ne change
  assert.equal(displayItemName("Magnifique Beef Menu"), "Magnifique Beef Menu");
  assert.equal(displayItemName(""), "");
});

test("l'article principal : avant le « + », sans le suffixe de catégorie", () => {
  assert.equal(mainTicketLabel("BelTacos Nuggets (Tacos) + Mayonnaise + No sauce fromager"), "BelTacos Nuggets");
  assert.equal(mainTicketLabel("Bel Tacos Nuggets [Tacos]"), "Bel Tacos Nuggets");
  assert.equal(mainTicketLabel("Medium Fries RPC + Schweppes Agrum"), "Medium Fries RPC");
  // La taille reste : c'est elle qui distingue deux articles de la carte
  assert.equal(mainTicketLabel("Nuggets (4PC.)"), "Nuggets (4PC.)");
  assert.equal(mainTicketLabel("Magnifique Beef Menu (Medium Fries) + Extra Cheese"), "Magnifique Beef Menu");
});
