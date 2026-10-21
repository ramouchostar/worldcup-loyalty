import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// La migration du profil (ADR 0084, PR S) et le code croient aux mêmes colonnes ; rien d'existant ne change.
const SQL = readFileSync("docs/migrations/20261021-1100-prestataires-profil.sql", "utf8");
const DATA = readFileSync("lib/providers-profile.ts", "utf8");
const REVENUE = readFileSync("lib/provider-revenue-data.ts", "utf8");
const ROUTE = readFileSync("app/api/prestataire/profil/route.ts", "utf8");
const CARD = readFileSync("components/missions/ProviderProfileCard.tsx", "utf8");

test("colonnes nullables, aucune table ni policy : rien d'existant ne change, et rejouable", () => {
  for (const line of SQL.split("\n").filter((l) => l.includes("ADD COLUMN"))) {
    assert.doesNotMatch(line, /NOT NULL/);
    assert.match(line, /IF NOT EXISTS/);
  }
  assert.doesNotMatch(SQL, /CREATE TABLE|CREATE POLICY/i);
});

test("chaque colonne ajoutée est lue ET écrite par le code", () => {
  for (const m of SQL.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)) assert.ok(DATA.includes(m[1]), m[1]);
});

test("le profil n'est écrit que pour le prestataire connecté, jamais pour un identifiant venu du corps", () => {
  assert.match(ROUTE, /saveProfile\(guard\.provider\.id,/);
  assert.doesNotMatch(ROUTE, /body\.(provider|id)/);
});

test("la lecture des revenus filtre sur le prestataire et ne lit jamais d'autres montants que les siens", () => {
  assert.match(REVENUE, /\.eq\("provider_id", providerId\)/);
  assert.doesNotMatch(REVENUE, /deposit_cents|paid_cents/);
});

test("les liens d'exemple s'ouvrent sans transmettre la page d'origine", () => {
  assert.match(CARD, /rel="noopener noreferrer nofollow"/);
});
