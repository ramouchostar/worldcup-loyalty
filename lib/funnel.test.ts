import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_REPORTABLE_STEPS,
  FUNNEL_STEPS,
  STEP_VIEW,
  computeStepTotals,
  isClientReportableStep,
} from "./funnel";

const totals = (entries: Record<string, number>) => new Map(Object.entries(entries));
const rateOf = (steps: ReturnType<typeof computeStepTotals>, step: string) =>
  steps.find((s) => s.step === step)!.rate;

test("les dix étapes du brief, ni plus ni moins", () => {
  assert.equal(FUNNEL_STEPS.length, 10);
});

test("chaque rateFrom pointe une étape connue, jamais elle-même", () => {
  for (const step of FUNNEL_STEPS) {
    const from = STEP_VIEW[step].rateFrom;
    if (from === null) continue;
    assert.ok(FUNNEL_STEPS.includes(from), `${step} → ${from} inconnue`);
    assert.notEqual(from, step, `${step} se compare à elle-même`);
  }
});

test("un rateFrom précède toujours son étape — sinon le taux dépasse 100 % par construction", () => {
  for (const [i, step] of FUNNEL_STEPS.entries()) {
    const from = STEP_VIEW[step].rateFrom;
    if (from === null) continue;
    assert.ok(FUNNEL_STEPS.indexOf(from) < i, `${step} se compare à ${from}, qui vient après`);
  }
});

test("taux de passage calculés sur le dénominateur déclaré, pas sur l'étage du dessus", () => {
  // `ticket_submitted` se compare à la photo prise (100 → 40), PAS à
  // `signup_completed` qui le précède dans la liste (20). C'est tout l'enjeu
  // du rateFrom explicite : un membre déjà inscrit saute les deux étages de
  // compte, comparer à eux donnerait 200 %.
  const steps = computeStepTotals(
    totals({
      qr_landing: 200,
      ticket_capture_opened: 100,
      signup_started: 50,
      signup_completed: 20,
      ticket_submitted: 40,
      ticket_validated: 30,
      ticket_rejected: 10,
    })
  );
  assert.equal(rateOf(steps, "ticket_capture_opened"), 50);
  assert.equal(rateOf(steps, "signup_started"), 50);
  assert.equal(rateOf(steps, "signup_completed"), 40);
  assert.equal(rateOf(steps, "ticket_submitted"), 40);
  assert.equal(rateOf(steps, "ticket_validated"), 75);
  assert.equal(rateOf(steps, "ticket_rejected"), 25);
});

test("dénominateur nul → aucun taux, jamais 0 %", () => {
  const steps = computeStepTotals(totals({ ticket_submitted: 5 }));
  // Rien n'a été compté en amont : « 0 % » laisserait croire à un décrochage
  // total là où il n'y a rien à comparer.
  assert.equal(rateOf(steps, "ticket_submitted"), null);
  assert.equal(rateOf(steps, "ticket_validated"), 0);
});

test("les étages sans dénominateur n'ont jamais de taux", () => {
  const steps = computeStepTotals(totals({ qr_landing: 10, home_viewed: 7 }));
  assert.equal(rateOf(steps, "qr_landing"), null);
  assert.equal(rateOf(steps, "home_viewed"), null);
});

test("totaux vides : dix étages à zéro, aucun taux", () => {
  const steps = computeStepTotals(new Map());
  assert.equal(steps.length, 10);
  assert.ok(steps.every((s) => s.count === 0 && s.rate === null));
});

test("seules les trois étapes déclarables par le navigateur sont acceptées", () => {
  assert.equal(CLIENT_REPORTABLE_STEPS.length, 3);
  for (const step of CLIENT_REPORTABLE_STEPS) assert.equal(isClientReportableStep(step), true);
  // Les faits serveur ne passent jamais par /api/funnel : un POST forgé ne
  // doit pas pouvoir gonfler « ticket validé » ni « compte créé ».
  assert.equal(isClientReportableStep("ticket_validated"), false);
  assert.equal(isClientReportableStep("signup_completed"), false);
  assert.equal(isClientReportableStep("qr_landing"), false);
  assert.equal(isClientReportableStep("DROP TABLE funnel_events"), false);
  assert.equal(isClientReportableStep(null), false);
  assert.equal(isClientReportableStep(42), false);
});
