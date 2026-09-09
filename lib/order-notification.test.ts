import { test } from "node:test";
import assert from "node:assert/strict";
import { orderValidatedMessage } from "./order-notification";
import { pointsForOrder } from "./points-model";

test("aucun euro ne sort du message, quel que soit le cas", () => {
  // La régression qu'on corrige : « Ta commande de 36,10 € a été validée ».
  // Un test sur le SYMBOLE plutôt que sur la phrase — c'est le symbole qui
  // constitue la violation (ADR 0028), pas telle formulation.
  const cas: Parameters<typeof orderValidatedMessage>[0][] = [
    { amountEur: 36.1 },
    { amountEur: 36.1, reward: "Finest burger" },
    { amountEur: 36.1, rescued: true },
    { amountEur: 36.1, reward: "Finest burger", rescued: true },
    { amountEur: 0 },
    { amountEur: 1234.56, reward: "Chef's Combo" },
  ];
  for (const c of cas) {
    const msg = orderValidatedMessage(c);
    assert.ok(!msg.includes("€"), `euro dans : ${msg}`);
    assert.ok(!/EUR/i.test(msg), `EUR dans : ${msg}`);
    // Le montant ne doit pas non plus se lire en clair sans symbole.
    assert.ok(!msg.includes("36,10"), `montant dans : ${msg}`);
    assert.ok(!msg.includes("36.1"), `montant dans : ${msg}`);
  }
});

test("le gain est exprimé en points, sur la courbe du modèle", () => {
  const msg = orderValidatedMessage({ amountEur: 25 });
  assert.ok(msg.includes(`+${pointsForOrder(25)} points`), msg);
});

test("le cadeau est nommé quand ce ticket en a créé un", () => {
  const msg = orderValidatedMessage({ amountEur: 30, reward: "Finest burger" });
  assert.ok(msg.includes("ton Finest burger t'attend au comptoir"), msg);
});

test("aucun cadeau nommé quand ce ticket n'en a pas créé", () => {
  // Cadeau déjà en attente (ADR 0011) ou rien d'atteint : on ne promet pas
  // un cadeau qui n'existe pas.
  const msg = orderValidatedMessage({ amountEur: 9, reward: null });
  assert.ok(!msg.includes("comptoir"), msg);
  assert.ok(!msg.includes("attend"), msg);
});

test("un ticket rattrapé le dit, un ticket normal ne le dit pas", () => {
  const rattrape = orderValidatedMessage({ amountEur: 30, rescued: true });
  const normal = orderValidatedMessage({ amountEur: 30 });
  assert.ok(rattrape.includes("pas passé du premier coup"), rattrape);
  assert.ok(rattrape.includes("réparé"), rattrape);
  assert.ok(!normal.includes("réparé"), normal);
  assert.notEqual(rattrape, normal);
});

test("jamais les mots que l'ADR 0008 bannit", () => {
  for (const rescued of [false, true]) {
    const msg = orderValidatedMessage({ amountEur: 30, reward: "Finest burger", rescued });
    for (const mot of ["automatique", "instantané", "vérifi"]) {
      assert.ok(!msg.toLowerCase().includes(mot), `« ${mot} » dans : ${msg}`);
    }
  }
});
