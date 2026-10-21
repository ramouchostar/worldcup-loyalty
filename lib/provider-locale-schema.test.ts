import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// La migration de la langue (ADR 0084, PR Z1) et le code croient à la même colonne, et son absence ne fait jamais tomber l'espace prestataire.
const SQL = readFileSync("docs/migrations/20261021-1300-prestataires-langue.sql", "utf8");
const LOCALE = readFileSync("lib/provider-locale.ts", "utf8");
const PROVIDERS = readFileSync("lib/providers.ts", "utf8");
const ROUTE = readFileSync("app/api/prestataire/langue/route.ts", "utf8");

test("colonne avec défaut français, trois langues seulement, rejouable", () => {
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'fr'/);
  assert.match(SQL, /CHECK \(locale IN \('fr', 'nl', 'en'\)\)/);
  assert.match(SQL, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'providers_locale_check'\)/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
});

test("la langue est lue À PART de la fiche : sans migration, l'espace prestataire ne tombe pas", () => {
  const cols = /const PROVIDER_COLUMNS = "([^"]+)"/.exec(PROVIDERS)![1];
  assert.doesNotMatch(cols, /locale/);
  assert.match(LOCALE, /select\("locale"\)/);
  assert.match(LOCALE, /return DEFAULT_LOCALE/);
  assert.match(LOCALE, /42703/);
});

test("la langue est lue une seule fois par requête, et ne s'écrit que pour le prestataire connecté", () => {
  assert.match(LOCALE, /export const getProviderLocale = cache\(/);
  assert.match(ROUTE, /requireProvider\(\)/);
  assert.match(ROUTE, /saveProviderLocale\(guard\.provider\.id,/);
  assert.doesNotMatch(ROUTE, /body\.(id|provider)/);
});
