import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Les invitations (ADR 0084, PR D) : ce que la migration promet doit rester vrai.
const SQL = readFileSync("docs/migrations/20261009-1500-prestataires-invitations.sql", "utf8");

test("les invitations sont en service-role only (RLS sans policy)", () => {
  assert.match(SQL, /ALTER TABLE provider_invites ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /CREATE POLICY \w+\s+ON provider_invites/i);
});

test("la seule policy ouverte est la lecture de SA propre ligne de prestataire, en SELECT, enveloppée", () => {
  const policies = [...SQL.matchAll(/CREATE POLICY (\w+)\s+ON (\w+)\s+FOR (\w+)\s+USING \(([^;]*)\);/gi)];
  assert.equal(policies.length, 1);
  const [, name, table, verb, using] = policies[0];
  assert.equal(name, "providers_own_read");
  assert.equal(table, "providers");
  assert.equal(verb.toUpperCase(), "SELECT");
  // auth.uid() enveloppé dans un SELECT : évalué une fois, pas une fois par ligne (PR #111).
  assert.match(using, /user_id = \(SELECT auth\.uid\(\)\)/);
});

test("un seul lien vivant par prestataire, lié à une adresse", () => {
  assert.match(SQL, /UNIQUE INDEX IF NOT EXISTS uq_provider_invites_active[\s\S]*?WHERE accepted_at IS NULL AND revoked_at IS NULL/);
  assert.match(SQL, /email\s+TEXT NOT NULL/);
});

test("la migration est rejouable", () => {
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS provider_invites/);
  assert.match(SQL, /DROP POLICY IF EXISTS providers_own_read ON providers/);
});
