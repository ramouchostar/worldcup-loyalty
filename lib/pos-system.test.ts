import { test } from "node:test";
import assert from "node:assert/strict";
import { POS_MAX_LENGTH, POS_UNKNOWN, groupPosAnswers, posSystemAnswer } from "./pos-system";

test("la réponse est gardée telle que tapée, nettoyée des espaces", () => {
  assert.equal(posSystemAnswer("  Lightspeed   K-Series ", false), "Lightspeed K-Series");
});

test("« Je ne sais pas » l'emporte sur un texte", () => {
  assert.equal(posSystemAnswer("Vectron", true), POS_UNKNOWN);
});

test("rien répondu = null (question sautée), jamais une chaîne vide", () => {
  assert.equal(posSystemAnswer("   ", false), null);
  assert.equal(posSystemAnswer(null, false), null);
});

test("longueur bornée", () => {
  assert.equal(posSystemAnswer("x".repeat(200), false)?.length, POS_MAX_LENGTH);
});

test("regroupement du réseau : sans tenir compte de la casse, le plus fréquent d'abord", () => {
  const out = groupPosAnswers(["Lightspeed", "lightspeed ", "Vectron", null, "", POS_UNKNOWN]);
  assert.deepEqual(out.groups, [
    { label: "Lightspeed", count: 2 },
    { label: POS_UNKNOWN, count: 1 },
    { label: "Vectron", count: 1 },
  ]);
  assert.equal(out.unanswered, 2);
});
