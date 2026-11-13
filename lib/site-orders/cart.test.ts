import assert from "node:assert/strict";
import { test } from "node:test";
import type { OptionChoice, OptionGroup } from "../menu-options/types";
import { checkRequest, priceOrder, type CatalogItem } from "./order";
import type { PublicItem } from "./menu";
import { addToCart, cartCount, cartTotal, lineKey, pruneSelection, removeLine, selectionState, setChoiceQty, setLineQty, startSelection, toOrderLines } from "./cart";

const choice = (id: string, name: string, o: Partial<OptionChoice> = {}): OptionChoice => ({ id, libraryId: `l-${id}`, name, priceDelta: 0, maxQty: 1, isDefault: false, isAvailable: true, groups: [], ...o });
const group = (id: string, kind: OptionGroup["kind"], min: number, max: number | null, choices: OptionChoice[]): OptionGroup => ({ id, title: id, kind, min, max, choices });

const frites = group("sauce-frites", "inclus", 0, 1, [choice("ketchup", "Ketchup"), choice("mayo", "Mayo")]);
const groups: OptionGroup[] = [
  group("taille", "variante", 1, 1, [choice("m", "Medium", { isDefault: true }), choice("l", "Large", { priceDelta: 1 })]),
  group("sauces", "inclus", 1, 2, [choice("ketchup", "Ketchup"), choice("samourai", "Samouraï"), choice("mayo", "Mayo")]),
  group("supp", "extra", 0, null, [choice("fromage", "Fromage", { priceDelta: 1.5, maxQty: 3 }), choice("frites", "Frites", { priceDelta: 2, groups: [frites] })]),
  group("crudites", "inclus", 0, null, [choice("salade", "Salade", { isDefault: true })]),
];
const item: PublicItem = { id: "burger", name: "Cheese burger", priceCents: 950, description: null, allergens: { text: "x", confirmed: false }, imageUrl: null, groups };

test("startSelection : les choix cochés d'office, et eux seulement", () => {
  const s = startSelection(groups);
  assert.deepEqual(s.taille, { m: 1 });
  assert.deepEqual(s.crudites, { salade: 1 });
  assert.deepEqual(s.sauces, {});
  assert.equal(selectionState(groups, s).ok, false); // la sauce manque
});

test("setChoiceQty : un groupe à un seul choix remplace l'ancien, un groupe à plusieurs refuse de dépasser son maximum", () => {
  let s = startSelection(groups);
  s = setChoiceQty(groups, s, "taille", "l", 1);
  assert.deepEqual(s.taille, { l: 1 });
  s = setChoiceQty(groups, s, "sauces", "ketchup", 1);
  s = setChoiceQty(groups, s, "sauces", "samourai", 1);
  const refused = setChoiceQty(groups, s, "sauces", "mayo", 1);
  assert.deepEqual(refused.sauces, { ketchup: 1, samourai: 1 }); // max 2 : inchangé
});

test("setChoiceQty : la quantité d'un choix est plafonnée, un choix inconnu ou en rupture est ignoré", () => {
  let s = startSelection(groups);
  s = setChoiceQty(groups, s, "supp", "fromage", 99);
  assert.deepEqual(s.supp, { fromage: 3 });
  assert.equal(setChoiceQty(groups, s, "supp", "fantome", 1), s);
  assert.equal(setChoiceQty(groups, s, "inconnu", "x", 1), s);
  const rupture: OptionGroup[] = [group("g", "inclus", 0, null, [choice("a", "A", { isAvailable: false })])];
  const base = startSelection(rupture);
  assert.equal(setChoiceQty(rupture, base, "g", "a", 1), base);
});

test("setChoiceQty : un sous-groupe s'ouvre avec le choix, et disparaît quand on le décoche", () => {
  let s = startSelection(groups);
  s = setChoiceQty(groups, s, "supp", "frites", 1);
  assert.ok("supp>frites>sauce-frites" in s);
  s = setChoiceQty(groups, s, "supp>frites>sauce-frites", "mayo", 1);
  assert.deepEqual(s["supp>frites>sauce-frites"], { mayo: 1 });
  s = setChoiceQty(groups, s, "supp", "frites", 0);
  assert.equal("supp>frites>sauce-frites" in s, false);
});

test("un panier valide est accepté par le serveur, à l'identique (prix compris)", () => {
  let s = startSelection(groups);
  s = setChoiceQty(groups, s, "taille", "l", 1);
  s = setChoiceQty(groups, s, "sauces", "samourai", 1);
  s = setChoiceQty(groups, s, "supp", "fromage", 2);
  s = setChoiceQty(groups, s, "supp", "frites", 1);
  s = setChoiceQty(groups, s, "supp>frites>sauce-frites", "ketchup", 1);
  assert.equal(selectionState(groups, s).ok, true);
  const cart = addToCart([], item, s, 2);
  // 9,50 + 1 (large) + 2 × 1,50 (fromage) + 2 (frites) = 15,50 € l'unité
  assert.equal(cart[0].unitCents, 1550);
  assert.equal(cartTotal(cart), 3100);

  const catalog = new Map<string, CatalogItem>([["burger", { id: "burger", name: "Cheese burger", price: 9.5, active: true, zone: null }]]);
  const req = checkRequest({ firstName: "Amina", phone: "0470123456", lines: toOrderLines(cart) });
  assert.ok(req.ok);
  if (req.ok) {
    const priced = priceOrder(req.request, catalog, new Map([["burger", groups]]));
    assert.ok(priced.ok, priced.ok ? "" : priced.message);
    if (priced.ok) assert.equal(priced.totalCents, cartTotal(cart)); // le prix du navigateur = le prix du serveur
  }
});

test("pruneSelection : retire les groupes fermés et les quantités nulles", () => {
  const s = pruneSelection(groups, { taille: { m: 1 }, sauces: { ketchup: 0 }, "supp>frites>sauce-frites": { mayo: 1 }, fantome: { x: 1 } });
  assert.deepEqual(Object.keys(s).sort(), ["crudites", "sauces", "supp", "taille"]);
  assert.deepEqual(s.sauces, {});
});

test("lineKey : stable quel que soit l'ordre des clés", () => {
  assert.equal(lineKey("a", { x: { b: 1, a: 2 }, y: {} }), lineKey("a", { y: {}, x: { a: 2, b: 1 } }));
  assert.notEqual(lineKey("a", { x: { a: 1 } }), lineKey("a", { x: { a: 2 } }));
  assert.notEqual(lineKey("a", {}), lineKey("b", {}));
});

test("panier : deux plats identiques se regroupent, la quantité est plafonnée, on peut modifier et retirer", () => {
  const simple: PublicItem = { ...item, id: "cola", name: "Coca", priceCents: 250, groups: [] };
  let cart = addToCart([], simple, {}, 1);
  cart = addToCart(cart, simple, {}, 1);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].qty, 2);
  cart = setLineQty(cart, cart[0].key, 99);
  assert.equal(cart[0].qty, 20);
  assert.equal(cartCount(cart), 20);
  cart = setLineQty(cart, cart[0].key, 0);
  assert.deepEqual(cart, []);
  cart = removeLine(addToCart([], simple, {}, 1), lineKey("cola", {}));
  assert.deepEqual(cart, []);
});

test("toOrderLines : jamais un prix ni un nom", () => {
  const cart = addToCart([], { ...item, groups: [] }, {}, 1);
  assert.deepEqual(Object.keys(toOrderLines(cart)[0]).sort(), ["articleId", "qty", "selection"]);
});
