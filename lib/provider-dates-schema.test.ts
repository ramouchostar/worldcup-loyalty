import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MISSION_STATUSES } from "./mission-states";

// La migration des disponibilités (ADR 0084, PR E) et le code croient aux mêmes règles.
const SQL = readFileSync("docs/migrations/20261012-1000-prestataires-disponibilites.sql", "utf8");
const DATES = readFileSync("lib/missions-dates.ts", "utf8");

test("service-role only : RLS sans policy", () => {
  assert.match(SQL, /ALTER TABLE provider_unavailability ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
});

test("un seul tournage par prestataire et par jour, sur les mêmes états que le code", () => {
  const sqlStatuses = [...(SQL.match(/status IN \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  const codeStatuses = [...(DATES.match(/BOOKED_STATUSES = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
  assert.ok(sqlStatuses.length > 0);
  assert.deepEqual(sqlStatuses, codeStatuses);
  for (const s of sqlStatuses) assert.ok((MISSION_STATUSES as readonly string[]).includes(s), s);
});

test("un jour se libère à l'annulation : « annule » et les états d'avant la date ne comptent pas", () => {
  const sqlStatuses = (SQL.match(/status IN \(([^)]*)\)/)?.[1] ?? "");
  for (const s of ["annule", "brief", "envoye", "devis", "accepte", "verse"]) assert.doesNotMatch(sqlStatuses, new RegExp(`'${s}'`), s);
});
