import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLeft, formatEur, isLowCredit, MIN_BUDGET_CENTS, paidCents, quote, spendCapCents } from "./money";

test("montant : budget + frais du forfait, sans TVA en franchise", () => {
  assert.deepEqual(quote({ budgetCents: 200_00, plan: "croissance", vatRate: 0 }), {
    budgetCents: 200_00, feePct: 15, feeCents: 30_00, netCents: 230_00, vatRate: 0, vatCents: 0, totalCents: 230_00,
  });
  assert.equal(quote({ budgetCents: 100_00, plan: "gratuit", vatRate: 0 }).totalCents, 120_00);
  assert.equal(quote({ budgetCents: 100_00, plan: "pro", vatRate: 0 }).totalCents, 105_00);
});

test("montant : la TVA s'ajoute le jour où l'émetteur sort de la franchise", () => {
  const q = quote({ budgetCents: 200_00, plan: "croissance", vatRate: 21 });
  assert.equal(q.vatCents, 48_30);
  assert.equal(q.totalCents, 278_30);
});

test("montant : frais arrondis au centime", () => {
  assert.equal(quote({ budgetCents: 123_45, plan: "croissance", vatRate: 0 }).feeCents, 18_52);
});

test("budget sous 100 € ou non entier : refusé", () => {
  assert.throws(() => quote({ budgetCents: 99_99, plan: "pro", vatRate: 0 }), RangeError);
  assert.throws(() => quote({ budgetCents: 150.5, plan: "pro", vatRate: 0 }), RangeError);
  assert.equal(quote({ budgetCents: MIN_BUDGET_CENTS, plan: "pro", vatRate: 0 }).budgetCents, 100_00);
});

test("affichage en euros", () => {
  assert.equal(formatEur(278_30), "278,30 €");
  assert.equal(formatEur(1_234_567_89), "1 234 567,89 €");
  assert.equal(formatEur(5), "0,05 €");
  assert.equal(formatEur(-12_00), "-12,00 €");
});

test("crédit payé = somme du registre ; plafond = total payé", () => {
  const paid = paidCents([
    { kind: "versement", amountCents: 200_00 },
    { kind: "versement", amountCents: 100_00 },
    { kind: "correction", amountCents: -10_00 },
  ]);
  assert.equal(paid, 290_00);
  assert.equal(spendCapCents(paid), 290_00);
  assert.throws(() => spendCapCents(50_00), RangeError);
});

test("jours restants au rythme des jours qui dépensent", () => {
  assert.equal(daysLeft(30_00, [10_00, 20_00, 0]), 2);
  assert.equal(daysLeft(30_00, [0, 0]), null);
  assert.equal(daysLeft(-5_00, [10_00]), 0);
  assert.equal(isLowCredit(19_00, [10_00]), true);
  assert.equal(isLowCredit(20_00, [10_00]), false);
  assert.equal(isLowCredit(1_00, []), false);
});
