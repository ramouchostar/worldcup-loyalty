import { test } from "node:test";
import assert from "node:assert/strict";
import { countNotedDays, weeklyPerformance } from "./revenue-weeks";
import type { RevenueDay } from "./revenue-tracker";

const day = (d: string, amount: number | null, closed = false): RevenueDay => ({ day: d, amount, closed, tickets: null });

/** Une semaine pleine à `amount` par jour, à partir du lundi donné. */
const week = (monday: string, amount: number): RevenueDay[] =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${monday}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return day(d.toISOString().slice(0, 10), amount);
  });

test("semaines passées seulement, moyenne par jour noté, écart à la semaine d'avant", () => {
  const days = [...week("2026-10-05", 1000), ...week("2026-10-12", 1100), ...week("2026-10-19", 900).slice(0, 5)];
  // Aujourd'hui samedi 24/10 : la semaine du 19 n'est pas finie, elle n'est pas lue.
  const v = weeklyPerformance(days, "2026-10-24");
  assert.equal(v.notedDays, 19);
  assert.deepEqual(
    v.weeks.map((w) => [w.monday, w.avgPerDay, w.total, w.noted, w.deltaPct]),
    [
      ["2026-10-05", 1000, 7000, 7, null],
      ["2026-10-12", 1100, 7700, 7, 10],
    ],
  );
});

test("une semaine trouée se lit par jour noté, pas en total ; moins de 3 jours : écartée", () => {
  const holed = week("2026-10-12", 1200).filter((_, i) => i % 2 === 0); // 4 jours notés
  const days = [...week("2026-10-05", 1000), ...holed, ...week("2026-09-28", 1000).slice(0, 2)];
  const v = weeklyPerformance(days, "2026-10-24");
  assert.deepEqual(v.weeks.map((w) => [w.monday, w.avgPerDay, w.noted]), [["2026-10-05", 1000, 7], ["2026-10-12", 1200, 4]]);
  assert.equal(v.weeks[1].deltaPct, 20);
});

test("un trou d'une semaine entière : pas d'écart avec une semaine qui n'est pas la précédente", () => {
  const v = weeklyPerformance([...week("2026-09-28", 1000), ...week("2026-10-12", 1300)], "2026-10-24");
  assert.equal(v.weeks[1].deltaPct, null);
});

test("jours fermés comptés à part, jamais comme 0 €", () => {
  const days = week("2026-10-12", 1000).map((d, i) => (i === 0 ? day(d.day, null, true) : d));
  const v = weeklyPerformance(days, "2026-10-24");
  assert.deepEqual([v.weeks[0].avgPerDay, v.weeks[0].noted, v.weeks[0].closed], [1000, 6, 1]);
  assert.equal(countNotedDays(days), 6);
});

test("huit semaines au plus, les plus récentes", () => {
  const days: RevenueDay[] = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date("2026-08-17T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + i * 7);
    days.push(...week(d.toISOString().slice(0, 10), 1000 + i));
  }
  const v = weeklyPerformance(days, "2026-10-26");
  assert.equal(v.weeks.length, 8);
  assert.equal(v.weeks[7].monday, "2026-10-19");
});
