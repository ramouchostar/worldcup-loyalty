import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aliasEmail, isTestName, TEST_PREFIX, TEST_PROVIDERS, testAnswers } from "./mission-test-set";
import { defaultTemplate, validateBrief } from "./mission-brief";

const today = "2026-10-21";

test("les réponses de test passent la validation du brief pour les quatre métiers", () => {
  for (const metier of ["video", "photo", "design", "impression"] as const) {
    const tpl = defaultTemplate(metier)!;
    const verdict = validateBrief(testAnswers(tpl, today), tpl, today);
    assert.deepEqual(verdict.issues, [], metier);
    assert.equal(verdict.ok, true, metier);
  }
});

test("le budget de test respecte le plancher du modèle", () => {
  const tpl = { ...defaultTemplate("video")!, budgetFloorCents: 400_000 };
  assert.equal(testAnswers(tpl, today).budget_cents, 400_000);
  assert.equal(validateBrief(testAnswers(tpl, today), tpl, today).ok, true);
});

test("l'impression de test ne réclame pas de fichier joint", () => {
  assert.equal(testAnswers(defaultTemplate("impression")!, today).file_state, "À faire faire");
});

test("alias : l'adresse du super-admin reçoit tout, sans doublon de +", () => {
  assert.equal(aliasEmail("Omar@Gmail.com", "video"), "omar+test-video@gmail.com");
  assert.equal(aliasEmail("omar+ancien@gmail.com", "photo"), "omar+test-photo@gmail.com");
  assert.equal(aliasEmail("pas-une-adresse", "design"), null);
  assert.equal(aliasEmail(null, "design"), null);
});

test("un prestataire de test par métier, tous marqués [TEST]", () => {
  assert.deepEqual(TEST_PROVIDERS.map((p) => p.metier).sort(), ["design", "impression", "photo", "video"]);
  for (const p of TEST_PROVIDERS) assert.ok(isTestName(p.name));
  assert.equal(isTestName("Studio Croustille"), false);
  assert.equal(isTestName(`${TEST_PREFIX}x`), true);
  assert.equal(isTestName(null), false);
});

test("l'effacement ne cible que le marqueur : jamais un prestataire sans [TEST]", () => {
  const src = readFileSync("lib/missions-test-set.ts", "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /isTestName/);
  // Chaque suppression passe par une liste d'identifiants issue du marqueur.
  assert.doesNotMatch(src, /\.delete\(\)\s*\.neq|\.delete\(\)\s*;/);
});

test("l'envoi d'un brief exclut les prestataires [TEST] hors établissement de démonstration", () => {
  const src = readFileSync("lib/missions.ts", "utf8");
  assert.match(src, /filter\(\(p\) => demo \|\| !isTestName\(p\.display_name\)\)/);
});
