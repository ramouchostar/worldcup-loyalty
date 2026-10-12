import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TERMS,
  MIN_DEPOSIT_BPS,
  balanceDue,
  formatEuros,
  priceBreakdown,
  providerQuoteView,
  splitPayment,
} from "./mission-money";

test("Gratuit et Croissance : le restaurateur paie P, le prestataire 87,5 %, Boosteats 12,5 %", () => {
  for (const plan of ["gratuit", "croissance"] as const) {
    const b = priceBreakdown(100_000, plan);
    assert.equal(b.paidCents, 100_000);
    assert.equal(b.providerCents, 87_500);
    assert.equal(b.platformCents, 12_500);
    assert.equal(b.commissionBps, 1_250);
  }
});

test("Pro : le restaurateur paie 92,5 % de P, le prestataire reçoit toujours 87,5 %, Boosteats garde 5 %", () => {
  const b = priceBreakdown(100_000, "pro");
  assert.equal(b.paidCents, 92_500);
  assert.equal(b.providerCents, 87_500);
  assert.equal(b.platformCents, 5_000);
  assert.equal(b.commissionBps, 500);
});

test("le prestataire reçoit la même somme quel que soit le plan", () => {
  for (const q of [1, 99, 12_345, 250_000, 999_999]) {
    const a = priceBreakdown(q, "gratuit").providerCents;
    assert.equal(priceBreakdown(q, "croissance").providerCents, a);
    assert.equal(priceBreakdown(q, "pro").providerCents, a);
  }
});

test("rien ne se perd : payé = prestataire + Boosteats, et Boosteats ne passe jamais en négatif", () => {
  for (const plan of ["gratuit", "croissance", "pro"] as const) {
    for (const q of [0, 1, 7, 333, 12_345, 100_000, 987_654]) {
      const b = priceBreakdown(q, plan);
      assert.equal(b.paidCents, b.providerCents + b.platformCents);
      assert.ok(b.platformCents >= 0, `${plan} ${q}`);
    }
  }
});

test("un montant non entier ou négatif est refusé (pas de flottants sur de l'argent)", () => {
  assert.throws(() => priceBreakdown(10.5, "gratuit"));
  assert.throws(() => priceBreakdown(-1, "gratuit"));
});

test("une remise Pro négative est refusée (commission Pro > commission standard)", () => {
  assert.throws(() => priceBreakdown(1000, "pro", { ...DEFAULT_TERMS, proCommissionBps: 2_000 }));
});

test("le prestataire lit « prix du devis » et « vous recevez »", () => {
  assert.deepEqual(providerQuoteView(80_000), { quoteCents: 80_000, youReceiveCents: 70_000 });
});

test("acompte : 20 % arrondi à l'excès, solde = reste", () => {
  assert.deepEqual(splitPayment(100_000), { depositCents: 20_000, balanceCents: 80_000, depositBps: 2_000 });
  const s = splitPayment(33_333);
  assert.equal(s.depositCents, 6_667);
  assert.equal(s.depositCents + s.balanceCents, 33_333);
});

test("l'acompte ne descend jamais sous 20 %, même si la configuration le demande", () => {
  assert.equal(splitPayment(100_000, 500).depositBps, MIN_DEPOSIT_BPS);
  assert.equal(splitPayment(100_000, 500).depositCents, 20_000);
  assert.equal(splitPayment(100_000, 5_000).depositCents, 50_000);
  assert.equal(splitPayment(100_000, 20_000).balanceCents, 0);
});

test("quand le solde est prélevé, selon le métier", () => {
  assert.deepEqual(balanceDue("video"), { when: "before_shoot", daysBefore: 2 });
  assert.deepEqual(balanceDue("photo"), { when: "before_shoot", daysBefore: 2 });
  assert.deepEqual(balanceDue("impression"), { when: "after_bat" });
  assert.deepEqual(balanceDue("design"), { when: "at_first_delivery" });
});

test("affichage des euros", () => {
  assert.match(formatEuros(120_000), /^1[\s  ]200 €$/);
  assert.match(formatEuros(12_050), /^120,50 €$/);
});
