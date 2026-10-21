import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { endedAt, isPurgeable, purgeCutoff, PURGE_MONTHS, type PurgeMission } from "./mission-purge";

const now = new Date("2027-10-21T10:00:00Z");
const m = (over: Partial<PurgeMission>): PurgeMission => ({ status: "verse", validated_at: "2026-10-20T10:00:00Z", cancelled_at: null, updated_at: "2026-10-20T10:00:00Z", ...over });

test("douze mois après la fin : purgeable ; la veille : non", () => {
  assert.equal(PURGE_MONTHS, 12);
  assert.equal(purgeCutoff(now).toISOString(), "2026-10-21T10:00:00.000Z");
  assert.equal(isPurgeable(m({ validated_at: "2026-10-21T09:00:00Z" }), now), true);
  assert.equal(isPurgeable(m({ validated_at: "2026-10-21T11:00:00Z" }), now), false);
});

test("seules les missions finies sont purgeables : jamais un litige ni une mission en cours", () => {
  for (const status of ["brief", "envoye", "devis", "accepte", "date_bloquee", "production", "livre", "retouche", "valide", "litige", "suspendu"]) {
    assert.equal(isPurgeable(m({ status, updated_at: "2020-01-01T00:00:00Z", validated_at: "2020-01-01T00:00:00Z" }), now), false, status);
  }
  assert.equal(isPurgeable(m({ status: "annule", cancelled_at: "2026-01-01T00:00:00Z", validated_at: null }), now), true);
});

test("la fin d'une mission annulée est l'annulation ; sinon la validation ; sinon la dernière mise à jour", () => {
  assert.equal(endedAt(m({ status: "annule", cancelled_at: "2026-03-01T00:00:00Z" })).toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(endedAt(m({ status: "annule", cancelled_at: null, updated_at: "2026-04-01T00:00:00Z" })).toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(endedAt(m({ validated_at: null, updated_at: "2026-05-01T00:00:00Z" })).toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(isPurgeable(m({ validated_at: "pas-une-date", updated_at: "pas-une-date" }), now), false);
});

test("le rapport est à blanc : aucune écriture ni suppression dans la couche base", () => {
  const src = readFileSync("lib/missions-purge.ts", "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\.(delete|update|insert|upsert|remove)\(/);
  assert.doesNotMatch(src, /storage/);
});
