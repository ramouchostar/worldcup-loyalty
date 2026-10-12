import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_LINKS } from "./mission-dayof";

// La migration du jour J (ADR 0084, PR G) et le code croient aux mêmes règles.
const SQL = readFileSync("docs/migrations/20261012-1200-prestataires-jour-j.sql", "utf8");
const MISSIONS = readFileSync("lib/missions.ts", "utf8");

test("service-role only : RLS sans policy, rejouable", () => {
  assert.match(SQL, /ALTER TABLE mission_deliveries ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS mission_deliveries/);
  for (const col of SQL.matchAll(/ALTER TABLE missions ADD COLUMN IF NOT EXISTS (\w+)/g)) assert.ok(col[1].length > 0);
});

test("le nombre maximal de liens du SQL est celui du code", () => {
  assert.match(SQL, new RegExp(String.raw`cardinality\(links\) BETWEEN 1 AND ${MAX_LINKS}\)`));
});

test("une seule livraison par tour", () => {
  assert.match(SQL, /UNIQUE \(mission_id, round\)/);
});

test("toutes les colonnes ajoutées sont lues par le code (aucune colonne morte)", () => {
  for (const m of SQL.matchAll(/ALTER TABLE missions ADD COLUMN IF NOT EXISTS (\w+)/g)) assert.ok(MISSIONS.includes(m[1]), m[1]);
});

test("les colonnes ajoutées sont nullables : aucune ligne existante ne change", () => {
  for (const line of SQL.split("\n").filter((l) => l.startsWith("ALTER TABLE missions ADD COLUMN"))) assert.doesNotMatch(line, /NOT NULL/);
});
