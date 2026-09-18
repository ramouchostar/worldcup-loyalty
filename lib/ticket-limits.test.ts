import { test } from "node:test";
import assert from "node:assert/strict";
import { brusselsDayStartIso, isDailyLimitReached, isFrequentSubmitter } from "./ticket-limits";

test("deux tickets par jour : le troisième est refusé", () => {
  assert.equal(isDailyLimitReached(0), false);
  assert.equal(isDailyLimitReached(1), false);
  assert.equal(isDailyLimitReached(2), true);
});

test("envois très fréquents : le 6e ticket sur 7 jours part en vérification", () => {
  assert.equal(isFrequentSubmitter(4), false); // ce ticket serait le 5e
  assert.equal(isFrequentSubmitter(5), true); // ce ticket serait le 6e
});

test("le jour commence à minuit, heure de Bruxelles (été et hiver)", () => {
  // Été (UTC+2) : 18/09 à 01:30 à Bruxelles = 17/09 23:30 UTC → jour du 18
  assert.equal(brusselsDayStartIso(new Date("2026-09-17T23:30:00Z")), "2026-09-17T22:00:00.000Z");
  // Hiver (UTC+1)
  assert.equal(brusselsDayStartIso(new Date("2026-12-10T12:00:00Z")), "2026-12-09T23:00:00.000Z");
});
