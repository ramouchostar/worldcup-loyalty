import { test } from "node:test";
import assert from "node:assert/strict";
import { REWARD_CLAIM_WINDOW_HOURS, claimDeadline, isClaimWindowOver } from "./reward-expiry";

const CREATED = "2026-09-07T10:00:00.000Z";

test("la fenêtre de récupération est de 48 h après la création (ADR 0011)", () => {
  assert.equal(REWARD_CLAIM_WINDOW_HOURS, 48);
  assert.equal(claimDeadline(CREATED).toISOString(), "2026-09-09T10:00:00.000Z");
});

test("le cadeau reste récupérable jusqu'à l'échéance, pas après", () => {
  assert.equal(isClaimWindowOver(CREATED, new Date("2026-09-09T09:59:59.000Z")), false);
  assert.equal(isClaimWindowOver(CREATED, new Date("2026-09-09T10:00:00.000Z")), true);
  assert.equal(isClaimWindowOver(CREATED, new Date("2026-09-30T10:00:00.000Z")), true);
});

test("un cadeau tout juste créé n'expire jamais par effet de bord", () => {
  const now = new Date("2026-09-09T10:00:00.000Z");
  assert.equal(isClaimWindowOver(now, now), false);
});

test("une date illisible ne fait expirer aucun cadeau", () => {
  // Mieux vaut un cadeau qui traîne qu'un cadeau retiré sur une donnée
  // qu'on ne sait pas lire — l'erreur visible côté membre est la même,
  // mais celle-ci se répare sans rien avoir détruit.
  assert.equal(isClaimWindowOver("pas une date", new Date("2026-09-09T10:00:00.000Z")), false);
});
