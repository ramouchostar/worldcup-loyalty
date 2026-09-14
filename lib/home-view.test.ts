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

test("bandeau : le cadeau qui attend passe avant la réserve", () => {
  assert.deepEqual(headerStatus({ hasGift: true, reserveBalance: 90, activeSaverTiers: 2 }), { kind: "gift" });
});

test("bandeau : la réserve seulement là où un gros cadeau est actif", () => {
  assert.deepEqual(headerStatus({ hasGift: false, reserveBalance: 44, activeSaverTiers: 1 }), { kind: "reserve", balance: 44 });
  assert.deepEqual(headerStatus({ hasGift: false, reserveBalance: 0, activeSaverTiers: 1 }), { kind: "reserve", balance: 0 });
  // Kraainem aujourd'hui : un solde, mais rien à échanger → pas de pastille
  assert.equal(headerStatus({ hasGift: false, reserveBalance: 44, activeSaverTiers: 0 }), null);
  assert.deepEqual(headerStatus({ hasGift: false, reserveBalance: -3, activeSaverTiers: 1 }), { kind: "reserve", balance: 0 });
});
