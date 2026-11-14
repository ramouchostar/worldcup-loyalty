import { test } from "node:test";
import assert from "node:assert/strict";
import { hourlyProfile, type HourlyRow } from "./hourly";

// Deux mardis (semaine) + un samedi (week-end), heures de Bruxelles.
const rows: HourlyRow[] = [
  // mardi 3 nov : 12 h creux, 19 h plein
  { hour_start: "2026-11-03T12:00:00+01:00", orders_count: 4, gross_inc_vat: 60 },
  { hour_start: "2026-11-03T19:00:00+01:00", orders_count: 40, gross_inc_vat: 800 },
  // mardi 10 nov : mêmes heures, valeurs proches
  { hour_start: "2026-11-10T12:00:00+01:00", orders_count: 6, gross_inc_vat: 80 },
  { hour_start: "2026-11-10T19:00:00+01:00", orders_count: 44, gross_inc_vat: 820 },
  // samedi 7 nov : 20 h plein
  { hour_start: "2026-11-07T20:00:00+01:00", orders_count: 50, gross_inc_vat: 1000 },
];

test("moyenne par heure, séparée semaine / week-end", () => {
  const p = hourlyProfile(rows);
  const midi = p.semaine.find((s) => s.hour === 12)!;
  const soir = p.semaine.find((s) => s.hour === 19)!;
  assert.equal(midi.avgOrders, 5); // (4+6)/2
  assert.equal(midi.days, 2);
  assert.equal(soir.avgOrders, 42); // (40+44)/2
  assert.equal(p.weekend.find((s) => s.hour === 20)!.avgOrders, 50);
});

test("heure pleine ≥ 66 % du pic, creuse ≤ 33 %", () => {
  const p = hourlyProfile(rows);
  assert.equal(p.semaine.find((s) => s.hour === 19)!.level, "plein"); // pic
  assert.equal(p.semaine.find((s) => s.hour === 12)!.level, "creux"); // 5 vs 42
});

test("une heure jamais observée n'apparaît pas", () => {
  const p = hourlyProfile(rows);
  assert.equal(p.semaine.find((s) => s.hour === 3), undefined);
  assert.equal(p.weekend.length, 1);
});

test("fuseau : 00 h 30 (Bruxelles) un dimanche reste dimanche, heure 0", () => {
  const p = hourlyProfile([{ hour_start: "2026-11-08T00:30:00+01:00", orders_count: 2, gross_inc_vat: 30 }]);
  assert.equal(p.weekend.find((s) => s.hour === 0)?.avgOrders, 2);
});

test("aucune donnée → profils vides", () => {
  const p = hourlyProfile([]);
  assert.deepEqual(p, { semaine: [], weekend: [] });
});
