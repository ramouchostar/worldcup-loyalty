import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_TERMS, MIN_DEPOSIT_BPS } from "./mission-money";
import { MAX_RETOUCH_ROUNDS, MISSION_STATUSES, AUTO_VALIDATE_DAYS } from "./mission-states";
import { SHOOT_MIN_DAYS, VIDEO_TEMPLATE } from "./mission-brief";

// Le schéma SQL et la logique pure croient aux mêmes règles : si l'un change sans l'autre,
// ce test casse (les échos de l'ADR 0065 — « qu'est-ce qui croyait l'ancienne règle ? »).
const SQL = readFileSync("docs/migrations/20261009-1030-prestataires-schema.sql", "utf8");

function listAfter(re: RegExp): string[] {
  const m = SQL.match(re);
  assert.ok(m, `motif introuvable : ${re}`);
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

test("les états SQL sont exactement ceux de lib/mission-states.ts", () => {
  const sqlStatuses = listAfter(/CHECK \(status IN \(('brief'[\s\S]*?'suspendu')\)\)/);
  assert.deepEqual([...sqlStatuses].sort(), [...MISSION_STATUSES].sort());
});

test("les valeurs par défaut du SQL sont celles de la logique pure", () => {
  assert.match(SQL, new RegExp(`commission_bps\\s+INTEGER NOT NULL DEFAULT ${DEFAULT_TERMS.commissionBps}\\b`));
  assert.match(SQL, new RegExp(`pro_commission_bps\\s+INTEGER NOT NULL DEFAULT ${DEFAULT_TERMS.proCommissionBps}\\b`));
  assert.match(SQL, new RegExp(`deposit_bps\\s+INTEGER NOT NULL DEFAULT ${DEFAULT_TERMS.depositBps} CHECK \\(deposit_bps BETWEEN ${MIN_DEPOSIT_BPS} AND`));
  assert.match(SQL, new RegExp(`max_retouch_rounds\\s+SMALLINT NOT NULL DEFAULT ${MAX_RETOUCH_ROUNDS}\\b`));
  assert.match(SQL, new RegExp(`auto_validate_days\\s+SMALLINT NOT NULL DEFAULT ${AUTO_VALIDATE_DAYS}\\b`));
  assert.match(SQL, new RegExp(`shoot_min_days\\s+SMALLINT NOT NULL DEFAULT ${SHOOT_MIN_DAYS}\\b`));
});

test("les métiers SQL sont ceux du modèle de brief", () => {
  const metiers = listAfter(/metiers\s+TEXT\[\][\s\S]*?ARRAY\[([^\]]*)\]/);
  assert.deepEqual(metiers, ["video", "photo", "design", "impression"]);
  assert.ok(metiers.includes(VIDEO_TEMPLATE.metier));
});

test("toutes les tables du module sont en service-role only (RLS sans policy)", () => {
  const tables = [...SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ["brief_templates", "marketplace_settings", "mission_events", "mission_quotes", "missions", "providers"]);
  for (const t of tables) assert.match(SQL, new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`), t);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
});
