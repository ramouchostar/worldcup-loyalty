import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// L'enregistrement d'un questionnaire (ADR 0084 §5 duodecies) crée une version, ne modifie jamais sur place, garde les budgets.
const SRC = readFileSync("lib/marketplace-templates.ts", "utf8");
const ACTIONS = readFileSync("app/platform/prestataires/actions.ts", "utf8");
const SCHEMA = readFileSync("docs/migrations/20261009-1030-prestataires-schema.sql", "utf8");

test("une nouvelle version à chaque enregistrement, l'ancienne désactivée (jamais modifiée sur place)", () => {
  assert.match(SRC, /\.update\(\{ active: false \}\)/);
  assert.match(SRC, /\.insert\(\{[\s\S]*version,/);
  assert.doesNotMatch(SRC, /\.update\(\{[^}]*questions/);
  assert.match(SCHEMA, /UNIQUE \(metier, version\)/);
  assert.match(SCHEMA, /brief_templates_one_active/);
});

test("le plancher et l'ambition passent d'une version à la suivante", () => {
  assert.match(SRC, /budget_floor_cents: row\?\.budget_floor_cents \?\? null/);
  assert.match(SRC, /ambition_budget_cents: row\?\.ambition_budget_cents \?\? \{\}/);
});

test("si l'insertion échoue, l'ancienne version est réactivée : jamais un métier sans questionnaire", () => {
  assert.match(SRC, /if \(e3\) \{[\s\S]{0,120}update\(\{ active: true \}\)\.eq\("id", row\.id\)/);
});

test("l'action est réservée au super-admin et ne connaît que les quatre métiers", () => {
  const fn = ACTIONS.slice(ACTIONS.indexOf("export async function saveQuestionnaireAction"));
  assert.match(fn, /requireSuperAdmin\(\)/);
  assert.match(fn, /BUDGET_METIERS\.includes\(metier\)/);
});
