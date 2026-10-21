import { test } from "node:test";
import assert from "node:assert/strict";
import { amountOf, bucketOf, brusselsMonth, revenueRows, revenueTotals, type RevenueMission } from "./provider-revenue";

const base: RevenueMission = {
  id: "m1",
  restaurantName: "Chez Omar",
  metier: "video",
  status: "accepte",
  quoteCents: 100_000,
  providerCents: 87_500,
  paidOutAt: null,
  cancellation: null,
  cancellationSettledAt: null,
  updatedAt: "2026-10-10T10:00:00Z",
};
const mk = (o: Partial<RevenueMission>): RevenueMission => ({ ...base, ...o });
const now = new Date("2026-10-21T10:00:00Z");

test("bucketOf : chaque état tombe dans sa case", () => {
  assert.equal(bucketOf(mk({ status: "accepte" })), "upcoming");
  assert.equal(bucketOf(mk({ status: "production" })), "upcoming");
  assert.equal(bucketOf(mk({ status: "retouche" })), "upcoming");
  assert.equal(bucketOf(mk({ status: "litige" })), "on_hold");
  assert.equal(bucketOf(mk({ status: "valide" })), "to_pay");
  assert.equal(bucketOf(mk({ status: "valide", paidOutAt: "2026-10-12T10:00:00Z" })), "paid");
  assert.equal(bucketOf(mk({ status: "verse" })), "paid");
});

test("bucketOf : rien sans montant ni sans accord", () => {
  assert.equal(bucketOf(mk({ status: "brouillon" })), "none");
  assert.equal(bucketOf(mk({ status: "propose" })), "none");
  assert.equal(bucketOf(mk({ status: "accepte", providerCents: null })), "none");
  assert.equal(bucketOf(mk({ status: "accepte", providerCents: 0 })), "none");
});

test("bucketOf : une annulation ne compte que si le prestataire touche quelque chose", () => {
  assert.equal(bucketOf(mk({ status: "annule" })), "none");
  assert.equal(bucketOf(mk({ status: "annule", cancellation: { providerPayoutCents: 0 } })), "none");
  assert.equal(bucketOf(mk({ status: "annule", cancellation: { providerPayoutCents: 5_000 } })), "cancel_due");
  assert.equal(bucketOf(mk({ status: "annule", cancellation: { providerPayoutCents: 5_000 }, cancellationSettledAt: "2026-10-12T10:00:00Z" })), "cancel_paid");
});

test("amountOf : la part figée du prestataire, jamais le prix du devis", () => {
  assert.equal(amountOf(mk({})), 87_500);
  assert.equal(amountOf(mk({ status: "annule", cancellation: { providerPayoutCents: 4_375 } })), 4_375);
  assert.equal(amountOf(mk({ status: "valide", providerCents: -5 })), 0);
});

test("revenueTotals : chaque case s'additionne sans se mélanger", () => {
  const t = revenueTotals(
    [
      mk({ id: "a", status: "accepte", providerCents: 10_000 }),
      mk({ id: "b", status: "production", providerCents: 20_000 }),
      mk({ id: "c", status: "litige", providerCents: 30_000 }),
      mk({ id: "d", status: "valide", providerCents: 40_000 }),
      mk({ id: "e", status: "valide", providerCents: 50_000, paidOutAt: "2026-10-05T10:00:00Z" }),
      mk({ id: "f", status: "verse", providerCents: 60_000, paidOutAt: "2026-09-20T10:00:00Z" }),
      mk({ id: "g", status: "annule", cancellation: { providerPayoutCents: 7_000 } }),
    ],
    now,
  );
  assert.deepEqual(t, { upcomingCents: 30_000, onHoldCents: 30_000, toPayCents: 40_000, cancelDueCents: 7_000, paidThisMonthCents: 50_000, paidTotalCents: 110_000 });
});

test("brusselsMonth : le mois se compte à l'heure de Bruxelles", () => {
  assert.equal(brusselsMonth("2026-09-30T23:30:00Z"), "2026-10");
  assert.equal(brusselsMonth("2026-10-31T23:30:00Z"), "2026-11");
});

test("revenueTotals : une annulation réglée compte dans le mois de son règlement", () => {
  const t = revenueTotals([mk({ status: "annule", cancellation: { providerPayoutCents: 7_000 }, cancellationSettledAt: "2026-10-03T10:00:00Z" })], now);
  assert.equal(t.paidThisMonthCents, 7_000);
  assert.equal(t.paidTotalCents, 7_000);
  assert.equal(t.cancelDueCents, 0);
});

test("revenueTotals : aucune mission, tout à zéro", () => {
  assert.deepEqual(revenueTotals([], now), { upcomingCents: 0, onHoldCents: 0, toPayCents: 0, cancelDueCents: 0, paidThisMonthCents: 0, paidTotalCents: 0 });
});

test("revenueRows : sans montant écarté, du plus récent au plus ancien", () => {
  const rows = revenueRows([
    mk({ id: "old", updatedAt: "2026-10-01T10:00:00Z" }),
    mk({ id: "none", status: "propose" }),
    mk({ id: "new", updatedAt: "2026-10-15T10:00:00Z" }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["new", "old"]);
  assert.equal(rows[0].amountCents, 87_500);
});
