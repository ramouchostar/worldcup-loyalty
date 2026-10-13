import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// La migration des annulations (ADR 0084 §4, PR I) et le code croient aux mêmes colonnes.
const SQL = readFileSync("docs/migrations/20261013-1000-prestataires-annulations.sql", "utf8");
const MISSIONS = readFileSync("lib/missions.ts", "utf8");
const CANCEL = readFileSync("lib/missions-cancel.ts", "utf8");

test("colonnes nullables, aucune table nouvelle, aucune policy : rien d'existant ne change", () => {
  for (const line of SQL.split("\n").filter((l) => l.startsWith("ALTER TABLE missions ADD COLUMN"))) assert.doesNotMatch(line, /NOT NULL/);
  assert.doesNotMatch(SQL, /CREATE TABLE|CREATE POLICY/i);
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS cancellation\s/);
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS cancellation_settled_at/);
});

test("toutes les colonnes ajoutées sont lues ET écrites par le code", () => {
  for (const m of SQL.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)) {
    assert.ok(MISSIONS.includes(m[1]), `${m[1]} lue`);
    assert.ok(CANCEL.includes(m[1]), `${m[1]} écrite`);
  }
});

test("l'index des annulations à régler porte sur les mêmes conditions que la requête de la plateforme", () => {
  assert.match(SQL, /WHERE status = 'annule' AND cancellation IS NOT NULL AND cancellation_settled_at IS NULL/);
  assert.match(CANCEL, /\.eq\("status", "annule"\)/);
  assert.match(CANCEL, /\.not\("cancellation", "is", null\)/);
  assert.match(CANCEL, /\.is\("cancellation_settled_at", null\)/);
});

test("l'annulation est un compare-and-swap sur l'état : deux clics, une seule annulation", () => {
  assert.match(CANCEL, /\.eq\("status", mission\.status\)/);
});
