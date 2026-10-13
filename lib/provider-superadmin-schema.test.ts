import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// La migration du superadmin (ADR 0084, PR J) et le code croient aux mêmes colonnes et aux mêmes conditions.
const SQL = readFileSync("docs/migrations/20261013-1100-prestataires-superadmin.sql", "utf8");
const MISSIONS = readFileSync("lib/missions.ts", "utf8");
const SUPER = readFileSync("lib/missions-superadmin.ts", "utf8");
const DATES = readFileSync("lib/missions-dates.ts", "utf8");
const PROVIDER_MISSIONS = readFileSync("lib/provider-missions.ts", "utf8");

test("colonnes nullables, aucune table, aucune policy : rien d'existant ne change", () => {
  for (const line of SQL.split("\n").filter((l) => l.startsWith("ALTER TABLE missions ADD COLUMN"))) assert.doesNotMatch(line, /NOT NULL/);
  assert.doesNotMatch(SQL, /CREATE TABLE|CREATE POLICY/i);
});

test("toutes les colonnes ajoutées sont écrites par le code du superadmin", () => {
  for (const m of SQL.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)) assert.ok(SUPER.includes(m[1]), m[1]);
});

test("les index partiels portent sur les mêmes conditions que les requêtes de la plateforme", () => {
  assert.match(SQL, /WHERE status = 'valide' AND paid_out_at IS NULL/);
  assert.match(SUPER, /\.eq\("status", "valide"\)[\s\S]{0,60}\.is\("paid_out_at", null\)/);
  assert.match(SQL, /WHERE status = 'litige'/);
  assert.match(SUPER, /\.eq\("status", "litige"\)/);
});

test("chaque décision et chaque versement est un compare-and-swap sur l'état : une seule décision, un seul versement", () => {
  assert.match(SUPER, /\.eq\("status", "litige"\) \/\/ deux membres/);
  assert.match(SUPER, /\.eq\("status", "valide"\)\.is\("paid_out_at", null\)/);
  assert.match(SUPER, /\.eq\("status", m\.status\)\.select/);
});

test("le versement n'écrit `verse` que sur une livraison validée, par la table des états", () => {
  assert.match(SUPER, /canTransition\("valide", "verse", "platform"\)/);
  assert.match(SUPER, /canTransition\("litige", "valide", "platform"\)/);
});

test("les montants de l'acceptation viennent des réglages, plus de constantes (les lectures et le prix affiché aussi)", () => {
  assert.doesNotMatch(DATES, /DEFAULT_TERMS/);
  assert.match(DATES, /getTerms\(\)/);
  assert.match(MISSIONS + PROVIDER_MISSIONS, /paid_cents/);
});
