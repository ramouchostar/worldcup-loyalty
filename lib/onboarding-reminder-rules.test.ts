import { test } from "node:test";
import assert from "node:assert/strict";
import { brusselsHour, decideOnboardingReminder, type OwnerOnboardingFacts } from "./onboarding-reminder-rules";

// Le cas réel qui a motivé la règle : Krusty, inscrit le 2026-10-05, bloqué
// sans carte ni ticket ; 1re relance dimanche 18 à 11 h, 2de lundi 19 à 19 h.
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

test("1re relance à 11 h (Bruxelles)", () => {
  assert.deepEqual(decideOnboardingReminder(facts(), ...at("2026-10-18T09:00:00Z")), { action: "send", step: 1 });
  assert.deepEqual(decideOnboardingReminder(facts(), ...at("2026-10-18T10:00:00Z")), { action: "wait", reason: "not_the_hour" });
});

test("2de relance à 19 h, au moins 24 h après la 1re", () => {
  const one = ["2026-10-18T09:00:05Z"];
  assert.deepEqual(decideOnboardingReminder(facts(one), ...at("2026-10-18T17:00:00Z")), { action: "wait", reason: "gap" });
  assert.equal(decideOnboardingReminder(facts(one), ...at("2026-10-19T09:00:00Z")).action, "wait"); // lundi 11 h : pas une heure de 2de relance
  assert.deepEqual(decideOnboardingReminder(facts(one), ...at("2026-10-19T17:00:00Z")), { action: "send", step: 2 });
});

test("jamais une 3e : plafonné puis signalé à l'équipe 48 h après la 2de", () => {
  const two = ["2026-10-18T09:00:05Z", "2026-10-19T17:00:05Z"];
  assert.deepEqual(decideOnboardingReminder(facts(two), ...at("2026-10-20T09:00:00Z")), { action: "capped" });
  assert.deepEqual(decideOnboardingReminder(facts(two), ...at("2026-10-21T17:00:05Z")), { action: "escalate" });
});

test("rien avant 48 h d'inscription", () => {
  const fresh = facts([], { oldestIncompleteCreatedAt: new Date("2026-10-17T08:00:00Z") });
  assert.deepEqual(decideOnboardingReminder(fresh, ...at("2026-10-18T09:00:00Z")), { action: "wait", reason: "too_early" });
});

test("inscription finie : plus rien", () => {
  assert.deepEqual(decideOnboardingReminder(facts([], { oldestIncompleteCreatedAt: null }), ...at("2026-10-18T09:00:00Z")), { action: "complete" });
});

test("journal illisible : n'envoie pas à l'aveugle", () => {
  assert.deepEqual(decideOnboardingReminder(facts([], { journalAvailable: false }), ...at("2026-10-18T09:00:00Z")), { action: "wait", reason: "journal_unavailable" });
});

test("suit l'heure d'été et d'hiver", () => {
  assert.equal(brusselsHour(new Date("2026-10-18T09:00:00Z")), 11); // CEST
  assert.equal(brusselsHour(new Date("2026-11-02T10:00:00Z")), 11); // CET
});
