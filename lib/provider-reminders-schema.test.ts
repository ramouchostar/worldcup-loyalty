import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// La migration des rappels (ADR 0084, PR F) et le code croient aux mêmes clés et destinataires.
const SQL = readFileSync("docs/migrations/20261012-1100-prestataires-rappels.sql", "utf8");
const RULES = readFileSync("lib/mission-reminders.ts", "utf8");
const list = (src: string, re: RegExp, quote: string) => [...(src.match(re)?.[1] ?? "").matchAll(new RegExp(`${quote}([a-z0-9]+)${quote}`, "g"))].map((m) => m[1]);

test("les clés de rappel du SQL sont celles des règles", () => {
  const sql = list(SQL, /key\s+TEXT NOT NULL CHECK \(key IN \(([^)]*)\)\)/, "'").sort();
  const code = list(RULES, /export type ReminderKey = ([^;]*);/, '"').sort();
  assert.deepEqual(sql, code);
  assert.deepEqual(sql, ["alerte", "j2", "j7", "veille"]);
});

test("les destinataires du SQL sont ceux des règles", () => {
  const sql = list(SQL, /audience\s+TEXT NOT NULL CHECK \(audience IN \(([^)]*)\)\)/, "'").sort();
  const code = list(RULES, /export type ReminderAudience = ([^;]*);/, '"').sort();
  assert.deepEqual(sql, code);
});

test("un rappel ne part jamais deux fois : la clé primaire est (mission, clé, destinataire)", () => {
  assert.match(SQL, /PRIMARY KEY \(mission_id, key, audience\)/);
});

test("service-role only : RLS sans policy, migration rejouable", () => {
  assert.match(SQL, /ALTER TABLE mission_reminders ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS mission_reminders/);
});
