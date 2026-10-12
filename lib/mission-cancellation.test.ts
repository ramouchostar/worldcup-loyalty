import { test } from "node:test";
import assert from "node:assert/strict";
import { brusselsInstant, cancelBand, cancellationOutcome, hoursBeforeShoot } from "./mission-cancellation";

test("bandes : plus de 7 jours gratuit, 7 jours à 48 h la moitié, moins de 48 h tout", () => {
  assert.equal(cancelBand(200), "free");
  assert.equal(cancelBand(168.01), "free");
  assert.equal(cancelBand(168), "half"); // « 7 jours à 48 h » inclut les bornes
  assert.equal(cancelBand(100), "half");
  assert.equal(cancelBand(48), "half");
  assert.equal(cancelBand(47.99), "full");
  assert.equal(cancelBand(0), "full");
  assert.equal(cancelBand(-3), "full");
});

const money = { paidCents: 100_000, providerCents: 87_500 };

test("restaurateur, plus de 7 jours : remboursé en entier, rien au prestataire", () => {
  const o = cancellationOutcome({ by: "restaurant", hoursBefore: 300, ...money });
  assert.deepEqual([o.refundCents, o.retainedCents, o.providerPayoutCents, o.platformKeepsCents], [100_000, 0, 0, 0]);
});

test("restaurateur, entre 7 jours et 48 h : 50 % retenus, versés au prestataire au prorata de sa part", () => {
  const o = cancellationOutcome({ by: "restaurant", hoursBefore: 72, ...money });
  assert.equal(o.band, "half");
  assert.equal(o.refundCents, 50_000);
  assert.equal(o.retainedCents, 50_000);
  assert.equal(o.providerPayoutCents, 43_750);
  assert.equal(o.platformKeepsCents, 6_250);
});

test("restaurateur, moins de 48 h : tout est retenu", () => {
  const o = cancellationOutcome({ by: "restaurant", hoursBefore: 10, ...money });
  assert.equal(o.refundCents, 0);
  assert.equal(o.retainedCents, 100_000);
  assert.equal(o.providerPayoutCents, 87_500);
  assert.equal(o.platformKeepsCents, 12_500);
});

test("un restaurateur absent le jour J perd tout, même avec un délai positif", () => {
  const o = cancellationOutcome({ by: "restaurant", hoursBefore: 500, noShow: true, ...money });
  assert.equal(o.band, "full");
  assert.equal(o.retainedCents, 100_000);
});

test("prestataire qui annule : le restaurateur est toujours remboursé, la sanction suit la bande", () => {
  const free = cancellationOutcome({ by: "provider", hoursBefore: 400, ...money });
  const half = cancellationOutcome({ by: "provider", hoursBefore: 100, ...money });
  const full = cancellationOutcome({ by: "provider", hoursBefore: 5, ...money });
  for (const o of [free, half, full]) {
    assert.equal(o.refundCents, 100_000);
    assert.equal(o.retainedCents, 0);
    assert.equal(o.providerPayoutCents, 0);
  }
  assert.deepEqual([free.providerSanction, half.providerSanction, full.providerSanction], ["none", "avertissement", "penalite"]);
});

test("un prestataire introuvable le jour J reçoit la pénalité", () => {
  assert.equal(cancellationOutcome({ by: "provider", hoursBefore: 900, noShow: true, ...money }).providerSanction, "penalite");
});

test("somme conservée : remboursé + retenu = payé", () => {
  for (const h of [500, 168, 100, 48, 47, 0, -10]) {
    const o = cancellationOutcome({ by: "restaurant", hoursBefore: h, paidCents: 33_333, providerCents: 29_166 });
    assert.equal(o.refundCents + o.retainedCents, 33_333);
    assert.equal(o.providerPayoutCents + o.platformKeepsCents, o.retainedCents);
  }
});

test("heure de Bruxelles : hiver UTC+1, été UTC+2, et le jour du changement d'heure", () => {
  assert.equal(brusselsInstant("2026-12-15", "09:30").toISOString(), "2026-12-15T08:30:00.000Z");
  assert.equal(brusselsInstant("2026-07-15", "09:30").toISOString(), "2026-07-15T07:30:00.000Z");
  // Passage à l'heure d'hiver le 2026-10-25 : 09:30 locale = UTC+1.
  assert.equal(brusselsInstant("2026-10-25", "09:30").toISOString(), "2026-10-25T08:30:00.000Z");
  // La veille, encore UTC+2.
  assert.equal(brusselsInstant("2026-10-24", "09:30").toISOString(), "2026-10-24T07:30:00.000Z");
});

test("heures avant le tournage", () => {
  const now = new Date("2026-12-14T08:30:00.000Z"); // 09:30 à Bruxelles
  assert.equal(hoursBeforeShoot("2026-12-15", "09:30", now), 24);
  assert.equal(hoursBeforeShoot("2026-12-14", "09:30", now), 0);
  assert.equal(hoursBeforeShoot("2026-12-14", "08:30", now), -1);
});
