import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REDEMPTION_MIN_ORDER_EUR,
  REWARD_CLAIM_WINDOW_HOURS,
  REWARD_UNLOCK_DELAY_HOURS,
  claimDeadline,
  claimOpensAt,
  formatOpensAt,
  isClaimNotYetOpen,
  isClaimWindowOver,
  redemptionRule,
} from "./reward-window";

const CREATED = "2026-09-07T10:00:00.000Z";

test("règles : ouverture 4 h après le ticket, puis 48 h pour récupérer, commande de 10 € minimum", () => {
  assert.equal(REWARD_UNLOCK_DELAY_HOURS, 4);
  assert.equal(REWARD_CLAIM_WINDOW_HOURS, 48);
  assert.equal(REDEMPTION_MIN_ORDER_EUR, 10);
});

test("cadeau de ticket : pas pendant la même visite (terrain Houba 2026-09-17)", () => {
  assert.equal(claimOpensAt(CREATED, "order").toISOString(), "2026-09-07T14:00:00.000Z");
  assert.equal(isClaimNotYetOpen(CREATED, "order", new Date("2026-09-07T10:02:00.000Z")), true);
  assert.equal(isClaimNotYetOpen(CREATED, "order", new Date("2026-09-07T13:59:59.000Z")), true);
  assert.equal(isClaimNotYetOpen(CREATED, "order", new Date("2026-09-07T14:00:00.000Z")), false);
});

test("cadeau de ticket : la fenêtre de 48 h court à partir de l'ouverture", () => {
  assert.equal(claimDeadline(CREATED, "order").toISOString(), "2026-09-09T14:00:00.000Z");
  assert.equal(isClaimWindowOver(CREATED, "order", new Date("2026-09-09T13:59:59.000Z")), false);
  assert.equal(isClaimWindowOver(CREATED, "order", new Date("2026-09-09T14:00:00.000Z")), true);
});

test("une ligne sans source est un cadeau de ticket", () => {
  assert.equal(claimOpensAt(CREATED, null).toISOString(), "2026-09-07T14:00:00.000Z");
});

test("anniversaire, gros cadeau de la réserve et cadeau du catalogue : ouverts tout de suite, 48 h", () => {
  for (const source of ["birthday", "saver", "catalog"] as const) {
    assert.equal(isClaimNotYetOpen(CREATED, source, new Date(CREATED)), false);
    assert.equal(claimDeadline(CREATED, source).toISOString(), "2026-09-09T10:00:00.000Z");
  }
});

test("une date illisible ne bloque ni ne fait expirer aucun cadeau", () => {
  const now = new Date("2026-09-09T10:00:00.000Z");
  assert.equal(isClaimNotYetOpen("pas une date", "order", now), false);
  assert.equal(isClaimWindowOver("pas une date", "order", now), false);
});

test("heure d'ouverture en heure de Bruxelles : aujourd'hui, demain, plus tard", () => {
  // 14:00 UTC = 16:00 à Bruxelles (heure d'été)
  const now = new Date("2026-09-07T10:00:00.000Z");
  assert.equal(formatOpensAt(new Date("2026-09-07T14:00:00.000Z"), now), "à 16:00");
  // 23:30 à Bruxelles le 7 → ouverture 03:30 le 8
  const late = new Date("2026-09-07T21:30:00.000Z");
  assert.equal(formatOpensAt(new Date("2026-09-08T01:30:00.000Z"), late), "demain à 03:30");
  assert.match(formatOpensAt(new Date("2026-09-10T14:00:00.000Z"), now), /^le 10 .* à 16:00$/);
});

test("la règle dite au membre nomme la prochaine visite et le minimum de 10 €", () => {
  assert.match(redemptionRule("order"), /prochaine visite.*10 €/);
  assert.doesNotMatch(redemptionRule("birthday"), /prochaine visite/);
  assert.match(redemptionRule("saver"), /10 €/);
});
