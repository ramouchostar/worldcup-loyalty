import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BENCHMARKS, calibrate, dailyAdvice, estimateResults, periodPresets, roundNice } from "./estimate";

test("notoriété 200 € : la campagne réelle de Houba retombe dans la fourchette", () => {
  // Houba, avril-mai 2026 : 472 € → 153 272 personnes. Rapporté à 200 € : ~65 000.
  const e = estimateResults({ objective: "NOTORIETE", budgetCents: 200_00, audience: null, benchmark: DEFAULT_BENCHMARKS.NOTORIETE });
  assert.equal(e.kind, "reach");
  assert.ok(e.lo <= 65_000 && 65_000 <= e.hi, `${e.lo}–${e.hi}`);
});

test("notoriété : la portée ne dépasse jamais l'audience de la zone", () => {
  const e = estimateResults({ objective: "NOTORIETE", budgetCents: 2000_00, audience: { lo: 40_000, hi: 48_000 }, benchmark: DEFAULT_BENCHMARKS.NOTORIETE });
  assert.ok(e.hi <= 40_000);
  assert.equal(e.audience, 48_000);
});

test("trafic : des clics, fourchette bas ≤ haut", () => {
  const e = estimateResults({ objective: "TRAFIC", budgetCents: 100_00, audience: null, benchmark: DEFAULT_BENCHMARKS.TRAFIC });
  assert.equal(e.kind, "clicks");
  assert.deepEqual([e.lo, e.hi], [100, 290]);
});

test("vidéo : des impressions avec une fréquence", () => {
  const e = estimateResults({ objective: "VIDEO", budgetCents: 150_00, audience: null, benchmark: DEFAULT_BENCHMARKS.VIDEO });
  assert.equal(e.kind, "impressions");
  assert.ok(e.lo < e.hi && e.frequency !== null);
});

test("calibrage : nos coûts réels remplacent le point central, sous 50 € rien ne bouge", () => {
  const base = DEFAULT_BENCHMARKS.NOTORIETE;
  assert.equal(calibrate(base, { spendCents: 40_00, impressions: 10_000, clicks: 0 }).calibrated, false);
  const c = calibrate(base, { spendCents: 100_00, impressions: 50_000, clicks: 5 }); // CPM réel 2 €
  assert.equal(c.calibrated, true);
  assert.ok(c.benchmark.cpm[0] < 2 && 2 < c.benchmark.cpm[1]);
  assert.deepEqual(c.benchmark.cpc, base.cpc); // trop peu de clics pour recaler le coût du clic
});

test("repère budget par jour", () => {
  assert.equal(dailyAdvice(4_00), "too_low");
  assert.equal(dailyAdvice(8_00), "low");
  assert.equal(dailyAdvice(14_28), "ok");
  assert.equal(dailyAdvice(25_00), "high");
});

test("raccourcis : milieu de novembre = lundi 9 → dimanche 22", () => {
  const p = periodPresets("2026-10-29");
  assert.deepEqual(p[0], { label: "Les 2 prochaines semaines", startsOn: "2026-10-30", endsOn: "2026-11-12" });
  assert.deepEqual(p[1], { label: "Semaines 2 et 3 de novembre", startsOn: "2026-11-09", endsOn: "2026-11-22" });
});

test("raccourcis : si le créneau du mois est passé, le mois suivant (y compris décembre → janvier)", () => {
  assert.equal(periodPresets("2026-11-15")[1].label, "Semaines 2 et 3 de décembre");
  assert.equal(periodPresets("2026-12-20")[1].label, "Semaines 2 et 3 de janvier");
  assert.equal(periodPresets("2026-12-20")[1].startsOn.slice(0, 4), "2027");
});

test("arrondi lisible", () => {
  assert.equal(roundNice(87_654), 88_000);
  assert.equal(roundNice(1_234), 1_200);
  assert.equal(roundNice(42), 42);
});
