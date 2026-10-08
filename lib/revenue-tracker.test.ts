import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRevenueTracker, type RevenueDay } from "./revenue-tracker";

const open = (day: string, amount: number, tickets: number | null = null): RevenueDay => ({ day, amount, closed: false, tickets });
const closed = (day: string): RevenueDay => ({ day, amount: null, closed: true, tickets: null });

test("rien de noté : tout est vide, rien n'est inventé", () => {
  const t = buildRevenueTracker({ today: "2026-10-08", days: [], program: {} });
  assert.equal(t.last, null);
  assert.equal(t.week, null);
  assert.equal(t.program, null);
  assert.equal(t.cells.length, 14);
  assert.equal(t.cells[13].day, "2026-10-07"); // jusqu'à hier
  assert.equal(t.notedDays, 0);
});

test("dernier jour : comparé aux mêmes jours de la semaine, ticket moyen", () => {
  const t = buildRevenueTracker({
    today: "2026-10-08",
    days: [open("2026-09-23", 1000), open("2026-09-30", 1200), open("2026-10-07", 1177.56, 52)],
    program: {},
  });
  assert.equal(t.last?.weekday, "mercredi");
  assert.equal(t.last?.sameAvg, 1100);
  assert.equal(t.last?.sameCount, 2);
  assert.equal(t.last?.deltaPct, 7);
  assert.equal(t.last?.avgTicket, 22.65);
});

test("le jour même n'est jamais compté (la caisse n'est pas fermée)", () => {
  const t = buildRevenueTracker({ today: "2026-10-08", days: [open("2026-10-07", 500), open("2026-10-08", 99)], program: {} });
  assert.equal(t.last?.day, "2026-10-07");
});

test("semaine : du lundi à hier, comparée seulement si la semaine d'avant est notée en entier", () => {
  // Jeudi 8 octobre : lundi 5, mardi 6, mercredi 7.
  const thisWeek = [open("2026-10-05", 300), open("2026-10-06", 400), open("2026-10-07", 500)];
  const partial = buildRevenueTracker({ today: "2026-10-08", days: [...thisWeek, open("2026-09-28", 300)], program: {} });
  assert.deepEqual(partial.week, { complete: false, total: 1200, days: 3, prevTotal: null, deltaPct: null });
  const full = buildRevenueTracker({
    today: "2026-10-08",
    days: [...thisWeek, open("2026-09-28", 300), closed("2026-09-29"), open("2026-09-30", 700)],
    program: {},
  });
  assert.deepEqual(full.week, { complete: false, total: 1200, days: 3, prevTotal: 1000, deltaPct: 20 });
});

test("semaine : le lundi, c'est la semaine dernière entière", () => {
  const t = buildRevenueTracker({ today: "2026-10-12", days: [open("2026-10-05", 300), open("2026-10-11", 600)], program: {} });
  assert.equal(t.week?.complete, true);
  assert.equal(t.week?.total, 900);
});

test("programme : part du CA et taux de capture sur les jours notés", () => {
  const t = buildRevenueTracker({
    today: "2026-10-08",
    days: [open("2026-10-06", 1000, 50), open("2026-10-07", 1000), closed("2026-10-05")],
    program: { "2026-10-06": { amount: 150, tickets: 7 }, "2026-10-07": { amount: 50, tickets: 2 }, "2026-10-05": { amount: 80, tickets: 3 } },
  });
  // 200 € sur 2 000 € notés ; le jour fermé ne compte pas.
  assert.equal(t.program?.sharePct, 10);
  // Taux de capture : seulement les jours où la caisse donne ses tickets (7 sur 50).
  assert.equal(t.program?.captureRatePct, 14);
});

test("cellules : fermé et non noté se distinguent", () => {
  const t = buildRevenueTracker({ today: "2026-10-08", days: [closed("2026-10-06"), open("2026-10-07", 500)], program: {} });
  const c6 = t.cells.find((c) => c.day === "2026-10-06");
  const c5 = t.cells.find((c) => c.day === "2026-10-05");
  assert.deepEqual([c6?.closed, c6?.amount], [true, null]);
  assert.deepEqual([c5?.closed, c5?.amount], [false, null]);
  assert.equal(t.cells.find((c) => c.isLast)?.day, "2026-10-07");
});
