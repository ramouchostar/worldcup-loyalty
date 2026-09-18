import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRetryKey } from "./receipt-ocr";

test("seconde lecture : seulement si un ticket est là (total lu) et que la clé manque", () => {
  // Cas des photos refusées de Kraainem : total lu, Bestelnummer lisible mais non trouvé
  assert.equal(shouldRetryKey({ orderNumber: null, amount: 9.8, hasKeyPattern: true }), true);
  // Clé déjà lue : rien à relancer
  assert.equal(shouldRetryKey({ orderNumber: "2026-09-05/223/09353", amount: 9.8, hasKeyPattern: true }), false);
  // Pas de total : sans doute pas un ticket (affiche, photo floue) — pas de dépense
  assert.equal(shouldRetryKey({ orderNumber: null, amount: null, hasKeyPattern: true }), false);
  // Établissement sans clé fiable : rien à chercher
  assert.equal(shouldRetryKey({ orderNumber: null, amount: 9.8, hasKeyPattern: false }), false);
});
