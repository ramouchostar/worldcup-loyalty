import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RETOUCH_ROUNDS,
  MISSION_STATUSES,
  autoValidation,
  canTransition,
  isTerminal,
  nextStatuses,
  roundsLeft,
  type MissionStatus,
} from "./mission-states";

test("le chemin heureux est autorisé de bout en bout, avec le bon acteur à chaque pas", () => {
  const chemin: [MissionStatus, MissionStatus, "restaurant" | "provider" | "system"][] = [
    ["brief", "envoye", "restaurant"],
    ["envoye", "devis", "provider"],
    ["devis", "accepte", "restaurant"],
    ["accepte", "date_bloquee", "system"],
    ["date_bloquee", "production", "provider"],
    ["production", "livre", "provider"],
    ["livre", "valide", "restaurant"],
    ["valide", "verse", "system"],
  ];
  for (const [from, to, by] of chemin) assert.deepEqual(canTransition(from, to, by), { ok: true }, `${from} → ${to}`);
});

test("un acteur ne fait pas le travail d'un autre", () => {
  assert.deepEqual(canTransition("envoye", "devis", "restaurant"), { ok: false, reason: "actor_not_allowed" });
  assert.deepEqual(canTransition("devis", "accepte", "provider"), { ok: false, reason: "actor_not_allowed" });
  assert.deepEqual(canTransition("production", "livre", "restaurant"), { ok: false, reason: "actor_not_allowed" });
});

test("on ne saute pas d'étape", () => {
  assert.deepEqual(canTransition("brief", "devis", "provider"), { ok: false, reason: "not_allowed" });
  assert.deepEqual(canTransition("envoye", "accepte", "restaurant"), { ok: false, reason: "not_allowed" });
  assert.deepEqual(canTransition("accepte", "verse", "platform"), { ok: false, reason: "not_allowed" });
});

test("verse et annule sont définitifs", () => {
  for (const s of ["verse", "annule"] as const) {
    assert.ok(isTerminal(s));
    for (const to of MISSION_STATUSES) assert.deepEqual(canTransition(s, to, "platform"), { ok: false, reason: "terminal" });
  }
});

test("deux tours de retours, le troisième est refusé", () => {
  assert.equal(MAX_RETOUCH_ROUNDS, 2);
  assert.deepEqual(canTransition("livre", "retouche", "restaurant", { roundsUsed: 0 }), { ok: true });
  assert.deepEqual(canTransition("livre", "retouche", "restaurant", { roundsUsed: 1 }), { ok: true });
  assert.deepEqual(canTransition("livre", "retouche", "restaurant", { roundsUsed: 2 }), { ok: false, reason: "no_rounds_left" });
  assert.equal(roundsLeft(0), 2);
  assert.equal(roundsLeft(2), 0);
  assert.equal(roundsLeft(5), 0);
});

test("le restaurateur qui n'a plus de tour peut encore valider", () => {
  assert.deepEqual(canTransition("livre", "valide", "restaurant", { roundsUsed: 2 }), { ok: true });
});

test("la plateforme tranche un litige : verser, rembourser ou faire refaire — pas le restaurateur", () => {
  assert.deepEqual(nextStatuses("litige", "platform").sort(), ["annule", "retouche", "verse"]);
  assert.deepEqual(nextStatuses("litige", "restaurant"), []);
  assert.deepEqual(nextStatuses("litige", "provider"), []);
});

test("un prélèvement échoué suspend la mission, qui repart une fois payée", () => {
  assert.deepEqual(canTransition("date_bloquee", "suspendu", "system"), { ok: true });
  assert.deepEqual(canTransition("suspendu", "date_bloquee", "system"), { ok: true });
  assert.deepEqual(canTransition("suspendu", "production", "provider"), { ok: false, reason: "not_allowed" });
});

test("un statut inconnu est refusé, sans exception", () => {
  assert.deepEqual(canTransition("nimporte" as MissionStatus, "valide", "platform"), { ok: false, reason: "unknown_status" });
  assert.deepEqual(canTransition("livre", "nimporte" as MissionStatus, "platform"), { ok: false, reason: "unknown_status" });
});

test("chaque statut a une règle (aucun état oublié dans la table)", () => {
  for (const s of MISSION_STATUSES) assert.ok(Array.isArray(nextStatuses(s, "platform")), s);
});

// ── Validation automatique ──
const delivered = new Date("2026-10-01T12:00:00Z");
const after = (days: number) => new Date(delivered.getTime() + days * 86_400_000);

test("validation automatique : on attend, on rappelle à J+3 et J+5, on valide à J+7", () => {
  assert.deepEqual(autoValidation(delivered, after(1), 0), { action: "wait" });
  assert.deepEqual(autoValidation(delivered, after(3), 0), { action: "remind", reminder: 1 });
  assert.deepEqual(autoValidation(delivered, after(4), 1), { action: "wait" });
  assert.deepEqual(autoValidation(delivered, after(5), 1), { action: "remind", reminder: 2 });
  assert.deepEqual(autoValidation(delivered, after(6), 2), { action: "wait" });
  assert.deepEqual(autoValidation(delivered, after(7), 2), { action: "validate" });
});

test("jamais de validation silencieuse : sans les deux rappels, on envoie le rappel manquant d'abord", () => {
  assert.deepEqual(autoValidation(delivered, after(8), 0), { action: "remind", reminder: 1 });
  assert.deepEqual(autoValidation(delivered, after(8), 1), { action: "remind", reminder: 2 });
  assert.deepEqual(autoValidation(delivered, after(30), 2), { action: "validate" });
});
