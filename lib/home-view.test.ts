import { test } from "node:test";
import assert from "node:assert/strict";
import { headerStatus } from "./home-view";

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
