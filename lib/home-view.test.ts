import { test } from "node:test";
import assert from "node:assert/strict";
import { headerStatus, reserveView, ticketPromiseItems } from "./home-view";

const tier = (min: number, item: string) => ({ min, item, cost: 1 });

test("promesse : noms distincts, du plus accessible au plus généreux", () => {
  const solo = [tier(40, "Menu"), tier(15, "Frites"), tier(25, "Burger"), tier(30, "Burger")];
  assert.deepEqual(ticketPromiseItems(solo), ["Frites", "Burger", "Menu"]);
});

test("promesse : au-delà du maximum, on garde l'éventail (premier, milieu, dernier)", () => {
  const solo = [tier(10, "A"), tier(20, "B"), tier(30, "C"), tier(40, "D"), tier(50, "E")];
  assert.deepEqual(ticketPromiseItems(solo), ["A", "C", "E"]);
  assert.deepEqual(ticketPromiseItems(solo, 2), ["A", "E"]);
  assert.deepEqual(ticketPromiseItems(solo, 1), ["A"]);
});

test("promesse : grille vide → rien à promettre", () => {
  assert.deepEqual(ticketPromiseItems([]), []);
});

const saver = [
  { id: "s2", min_threshold: 120, item_name: "Menu XL" },
  { id: "s1", min_threshold: 60, item_name: "Burger" },
];

test("réserve : solde sous le premier gros cadeau", () => {
  const v = reserveView(30, saver);
  assert.equal(v.reachable, null);
  assert.equal(v.next?.id, "s1");
  assert.equal(v.pct, 50);
});

test("réserve : un gros cadeau atteignable, le suivant visé", () => {
  const v = reserveView(90, saver);
  assert.equal(v.reachable?.id, "s1");
  assert.equal(v.next?.id, "s2");
  assert.equal(v.pct, 75);
});

test("réserve : tout est atteignable, solde négatif ramené à zéro", () => {
  const all = reserveView(500, saver);
  assert.equal(all.reachable?.id, "s2");
  assert.equal(all.next, null);
  assert.equal(all.pct, 100);
  assert.equal(reserveView(-5, saver).balance, 0);
  assert.equal(reserveView(10, []).next, null);
});

test("bandeau : le cadeau qui attend passe avant les points", () => {
  assert.deepEqual(headerStatus({ hasGift: true, pointsBalance: 900, catalogueSize: 20 }), { kind: "gift" });
});

test("bandeau : « Mes points » seulement là où le catalogue propose un article (ADR 0061)", () => {
  assert.deepEqual(headerStatus({ hasGift: false, pointsBalance: 440, catalogueSize: 12 }), { kind: "points", balance: 440 });
  assert.deepEqual(headerStatus({ hasGift: false, pointsBalance: 0, catalogueSize: 12 }), { kind: "points", balance: 0 });
  // Un solde sans rien à choisir n'appelle aucune action → pas de pastille
  assert.equal(headerStatus({ hasGift: false, pointsBalance: 440, catalogueSize: 0 }), null);
  assert.deepEqual(headerStatus({ hasGift: false, pointsBalance: -3, catalogueSize: 1 }), { kind: "points", balance: 0 });
});
