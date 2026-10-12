import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_NOTES } from "./mission-retouch";
import { MAX_RETOUCH_ROUNDS } from "./mission-states";

// La migration des retouches (ADR 0084 §3 règle 8, PR H) et le code croient aux mêmes règles.
const SQL = readFileSync("docs/migrations/20261012-1300-prestataires-retouches.sql", "utf8");

test("deux tours au plus, dans la base comme dans le code", () => {
  assert.equal(MAX_RETOUCH_ROUNDS, 2);
  assert.match(SQL, /round\s+SMALLINT NOT NULL CHECK \(round BETWEEN 1 AND 2\)/);
  assert.match(SQL, /CHECK \(retouch_rounds_used <= 2\)/);
});

test("un tour = une ligne, et au plus autant de remarques que le code l'accepte", () => {
  assert.match(SQL, /UNIQUE \(mission_id, round\)/);
  assert.match(SQL, new RegExp(String.raw`jsonb_array_length\(notes\) BETWEEN 1 AND ${MAX_NOTES}\)`));
});

test("service-role only : RLS sans policy, migration rejouable", () => {
  assert.match(SQL, /ALTER TABLE mission_retouches ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS mission_retouches/);
  assert.match(SQL, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'missions_retouch_rounds_max_two'\)/);
});
