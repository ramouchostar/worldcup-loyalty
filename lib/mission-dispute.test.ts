import { test } from "node:test";
import assert from "node:assert/strict";
import { RESOLVE_ISSUE_TEXT, canOpenDispute, needsAttention, sanitizeResolve, splitMoney, validateDisputeText, validateResolve } from "./mission-dispute";
import { MISSION_STATUSES } from "./mission-states";

test("on ouvre un litige de l'acompte à la dernière retouche, jamais avant ni après", () => {
  for (const s of ["accepte", "date_bloquee", "production", "livre", "retouche"] as const) assert.equal(canOpenDispute(s), true, s);
  for (const s of MISSION_STATUSES.filter((x) => !["accepte", "date_bloquee", "production", "livre", "retouche"].includes(x))) assert.equal(canOpenDispute(s), false, s);
});

test("le texte d'un litige : 10 à 1 000 caractères", () => {
  assert.deepEqual(validateDisputeText("court"), { ok: false, issue: "too_short" });
  assert.deepEqual(validateDisputeText(undefined), { ok: false, issue: "too_short" });
  assert.deepEqual(validateDisputeText("  Le tournage a duré deux fois plus.  "), { ok: true, text: "Le tournage a duré deux fois plus." });
  assert.deepEqual(validateDisputeText("x".repeat(1001)), { ok: false, issue: "too_long" });
});

const ok = (over: Record<string, unknown> = {}, hasDelivery = true) => validateResolve(sanitizeResolve({ decision: "refund", note: "Le brief n'a pas été respecté.", ...over }), { hasDelivery });

test("rembourser : avec ou sans sanction", () => {
  assert.equal(ok().ok, true);
  const r = ok({ sanction: "penalite" });
  assert.equal(r.ok && r.input.sanction, "penalite");
});

test("verser demande une livraison, et ne se sanctionne pas", () => {
  assert.equal(ok({ decision: "pay" }).ok, true);
  assert.deepEqual(ok({ decision: "pay" }, false), { ok: false, issue: "pay_needs_delivery" });
  assert.deepEqual(ok({ decision: "pay", sanction: "avertissement" }), { ok: false, issue: "sanction_not_allowed" });
});

test("partager : une part entière entre 1 et 99", () => {
  assert.equal(ok({ decision: "split", providerPct: 60 }).ok, true);
  assert.equal(ok({ decision: "split", providerPct: "60,0" }).ok, true);
  for (const bad of [0, 100, 50.5, -5, null, "beaucoup", ""]) assert.deepEqual(ok({ decision: "split", providerPct: bad }), { ok: false, issue: "pct_invalid" }, String(bad));
});

test("une décision inconnue, une sanction inconnue, une note vide : refusées", () => {
  assert.deepEqual(ok({ decision: "annuler" }), { ok: false, issue: "decision_unknown" });
  assert.deepEqual(ok({ sanction: "bannissement" }), { ok: false, issue: "sanction_unknown" });
  assert.deepEqual(ok({ note: "ok" }), { ok: false, issue: "note_invalid" });
  for (const k of Object.keys(RESOLVE_ISSUE_TEXT)) assert.ok(RESOLVE_ISSUE_TEXT[k as keyof typeof RESOLVE_ISSUE_TEXT].length > 10, k);
});

test("le pourcentage ne s'applique qu'à un partage", () => {
  const r = ok({ decision: "refund", providerPct: 40 });
  assert.equal(r.ok && r.input.providerPct, null);
});

// ── l'argent ──
test("rembourser rend tout, sans rien verser", () => {
  assert.deepEqual(splitMoney("refund", 100_000, 87_500, null), { refundCents: 100_000, retainedCents: 0, providerPayoutCents: 0, platformKeepsCents: 0 });
});

test("partager à 60 % : 60 % du prix retenu, 60 % de SA part pour le prestataire, le reste rendu", () => {
  const m = splitMoney("split", 100_000, 87_500, 60);
  assert.deepEqual(m, { refundCents: 40_000, retainedCents: 60_000, providerPayoutCents: 52_500, platformKeepsCents: 7_500 });
});

test("somme conservée à tous les pourcentages ; jamais plus au prestataire qu'on n'a retenu", () => {
  for (const pct of [1, 7, 33, 50, 99]) for (const paid of [33_333, 100_000, 92_500]) {
    const m = splitMoney("split", paid, Math.round(paid * 0.875), pct);
    assert.equal(m.refundCents + m.retainedCents, paid, `${pct}/${paid}`);
    assert.equal(m.providerPayoutCents + m.platformKeepsCents, m.retainedCents, `${pct}/${paid}`);
    assert.ok(m.platformKeepsCents >= 0 && m.providerPayoutCents <= m.retainedCents);
  }
});

test("une part hors bornes est ramenée (défense : l'écran la refuse déjà)", () => {
  assert.equal(splitMoney("split", 100_000, 87_500, 500).retainedCents, 99_000);
  assert.equal(splitMoney("split", 100_000, 87_500, 0).retainedCents, 1_000);
  assert.equal(splitMoney("split", 100_000, 87_500, null).retainedCents, 1_000);
});

// ── à surveiller ──
test("un compte-rendu contesté sans litige ouvert attire l'attention, tant qu'il n'est pas tranché", () => {
  const m = { status: "production", report_contested_at: "x", report_confirmed_at: null };
  assert.equal(needsAttention(m), true);
  assert.equal(needsAttention({ ...m, status: "litige" }), false);
  assert.equal(needsAttention({ ...m, status: "annule" }), false);
  assert.equal(needsAttention({ ...m, status: "verse" }), false);
  assert.equal(needsAttention({ ...m, report_contested_at: null }), false);
  assert.equal(needsAttention({ ...m, report_confirmed_at: "y" }), false);
});
