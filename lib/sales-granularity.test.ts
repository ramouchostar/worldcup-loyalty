import { test } from "node:test";
import assert from "node:assert/strict";
import { detectGranularity, summarizeTrend } from "./sales-granularity";

const seq = (start: string, step: number, n: number) => {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + step); }
  return out;
};

test("détail journalier (une ou plusieurs lignes par jour) → daily", () => {
  const days = seq("2026-06-01", 1, 60);
  const g = detectGranularity([...days, ...days]); // doublons = plusieurs tickets par jour
  assert.equal(g.kind, "daily");
  assert.equal(g.periods, 60);
  assert.match(g.label, /60 jours/);
});

test("journalier avec jours de fermeture (lundis manquants) → toujours daily", () => {
  const days = seq("2026-06-02", 1, 42).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 1);
  assert.equal(detectGranularity(days).kind, "daily");
});

test("totaux hebdomadaires (une date par semaine) → weekly", () => {
  const g = detectGranularity(seq("2026-03-02", 7, 13));
  assert.equal(g.kind, "weekly");
  assert.match(g.label, /13 semaines/);
});

test("totaux mensuels (1er de chaque mois) → monthly", () => {
  const g = detectGranularity(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]);
  assert.equal(g.kind, "monthly");
  assert.match(g.label, /6 mois/);
});

test("une seule date ou aucune → unknown, sans planter", () => {
  assert.equal(detectGranularity(["2026-06-01"]).kind, "unknown");
  assert.equal(detectGranularity([]).kind, "unknown");
  assert.equal(detectGranularity(["n/a", ""]).periods, 0);
});

test("tendance hebdo : moyenne des 4 dernières, dernière vs précédente", () => {
  const rows = seq("2026-06-01", 7, 6).map((d, i) => ({ sold_on: d, amount: 1000 + i * 100 })); // 1000…1500
  const t = summarizeTrend(rows, "weekly");
  assert.equal(t.periodLabel, "semaine");
  assert.equal(t.periods, 6);
  assert.equal(t.avgRecent, (1200 + 1300 + 1400 + 1500) / 4);
  assert.equal(t.last, 1500);
  assert.equal(t.previous, 1400);
  assert.equal(t.direction, "up");
});

test("tendance stable (< 3 %) → flat ; une seule période → na", () => {
  assert.equal(summarizeTrend([{ sold_on: "2026-05-01", amount: 5000 }, { sold_on: "2026-06-01", amount: 5050 }], "monthly").direction, "flat");
  assert.equal(summarizeTrend([{ sold_on: "2026-06-01", amount: 5000 }], "monthly").direction, "na");
});
