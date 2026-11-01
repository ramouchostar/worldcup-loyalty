import { test } from "node:test";
import assert from "node:assert/strict";
import { brusselsHour, decideOnboardingReminder, MAX_REMINDERS, type OwnerOnboardingFacts } from "./onboarding-reminder-rules";

// Le cas réel : Krusty, inscrit le 2026-10-05, bloqué sans carte ni ticket,
// jamais relancé (cron coupé avant le bloc). Cadence décidée le 2026-11-01.
const created = new Date("2026-10-05T16:14:29Z");
const facts = (sentAt: string[] = [], extra: Partial<OwnerOnboardingFacts> = {}): OwnerOnboardingFacts => ({
  oldestIncompleteCreatedAt: created,
  sentAt: sentAt.map((s) => new Date(s)),
  journalAvailable: true,
  ...extra,
});
const at = (iso: string) => {
  const d = new Date(iso);
  return [d, brusselsHour(d)] as const;
};

test("1re relance à 11 h (Bruxelles), jamais à une autre heure", () => {
  assert.deepEqual(decideOnboardingReminder(facts(), ...at("2026-11-02T10:00:00Z")), { action: "send", step: 1, last: false, escalate: false });
  assert.equal(decideOnboardingReminder(facts(), ...at("2026-11-02T11:00:00Z")).action, "wait");
});

test("inscrit ancien : pas de rattrapage en rafale, l'écart compte depuis la relance précédente", () => {
  const one = ["2026-11-02T10:00:05Z"];
  assert.deepEqual(decideOnboardingReminder(facts(one), ...at("2026-11-03T10:00:00Z")), { action: "wait", reason: "gap", escalate: false });
  assert.deepEqual(decideOnboardingReminder(facts(one), ...at("2026-11-06T10:00:00Z")), { action: "wait", reason: "gap", escalate: false });
  assert.equal(decideOnboardingReminder(facts(one), ...at("2026-11-07T10:00:00Z")).action, "send"); // +5 jours
});

test("nouvel inscrit : J+2, J+7, J+14, puis toutes les deux semaines", () => {
  const c = new Date("2026-11-02T08:00:00Z");
  const f = (sent: string[]) => facts(sent, { oldestIncompleteCreatedAt: c });
  assert.equal(decideOnboardingReminder(f([]), ...at("2026-11-04T10:00:00Z")).action, "send"); // J+2
  assert.equal(decideOnboardingReminder(f(["2026-11-04T10:00:05Z"]), ...at("2026-11-09T10:00:00Z")).action, "send"); // J+7
  const two = ["2026-11-04T10:00:05Z", "2026-11-09T10:00:05Z"];
  assert.equal(decideOnboardingReminder(f(two), ...at("2026-11-15T10:00:00Z")).action, "wait");
  assert.deepEqual(decideOnboardingReminder(f(two), ...at("2026-11-16T10:00:00Z")), { action: "send", step: 3, last: false, escalate: false }); // J+14
  const three = [...two, "2026-11-16T10:00:05Z"];
  assert.equal(decideOnboardingReminder(f(three), ...at("2026-11-29T10:00:00Z")).action, "wait");
  assert.deepEqual(decideOnboardingReminder(f(three), ...at("2026-11-30T10:00:00Z")), { action: "send", step: 4, last: false, escalate: true }); // J+28
});

test("six relances au plus, la 6e est annoncée comme la dernière", () => {
  const five = ["2026-11-04T10:00:05Z", "2026-11-09T10:00:05Z", "2026-11-16T10:00:05Z", "2026-11-30T10:00:05Z", "2026-12-14T10:00:05Z"];
  assert.deepEqual(decideOnboardingReminder(facts(five), ...at("2026-12-28T10:00:00Z")), { action: "send", step: MAX_REMINDERS, last: true, escalate: true });
  assert.deepEqual(decideOnboardingReminder(facts([...five, "2026-12-28T10:00:05Z"]), ...at("2027-01-30T10:00:00Z")), { action: "capped", escalate: true });
});

test("rien avant 48 h d'inscription", () => {
  const fresh = facts([], { oldestIncompleteCreatedAt: new Date("2026-11-01T08:00:00Z") });
  assert.deepEqual(decideOnboardingReminder(fresh, ...at("2026-11-02T10:00:00Z")), { action: "wait", reason: "too_early", escalate: false });
});

test("inscription finie : plus rien", () => {
  assert.deepEqual(decideOnboardingReminder(facts([], { oldestIncompleteCreatedAt: null }), ...at("2026-11-02T10:00:00Z")), { action: "complete" });
});

test("journal illisible : n'envoie pas à l'aveugle", () => {
  assert.deepEqual(decideOnboardingReminder(facts([], { journalAvailable: false }), ...at("2026-11-02T10:00:00Z")), { action: "wait", reason: "journal_unavailable", escalate: false });
});

test("suit l'heure d'été et d'hiver", () => {
  assert.equal(brusselsHour(new Date("2026-10-18T09:00:00Z")), 11); // CEST
  assert.equal(brusselsHour(new Date("2026-11-02T10:00:00Z")), 11); // CET
});
