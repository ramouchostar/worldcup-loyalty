import { test } from "node:test";
import assert from "node:assert/strict";
import { gap, isFilled, parseSalesRow, windowStart } from "./model";

test("la fenêtre glissante finit aujourd'hui et couvre 14 jours par défaut", () => {
  assert.equal(windowStart("2026-11-14"), "2026-11-01");
  assert.equal(windowStart("2026-11-14", 7), "2026-11-08");
  assert.equal(windowStart("2026-03-15", 120), "2025-11-16"); // historique
});

test("une ligne agg_sales_daily se lit en CA TTC, HT, commandes", () => {
  const d = parseSalesRow({ business_date_utc: "2026-11-08", gross_inc_vat: 2763.0, gross_exc_vat: 2549.1615, orders_count: 150 });
  assert.deepEqual(d, { sales_day: "2026-11-08", gross_inc_vat: 2763, gross_exc_vat: 2549.16, orders_count: 150 });
});

test("une ligne sans date est rejetée", () => {
  assert.equal(parseSalesRow({ gross_inc_vat: 10 }), null);
  assert.equal(parseSalesRow(null), null);
});

test("un jour vide (0 commande, 0 €) n'est pas encore rempli", () => {
  assert.equal(isFilled({ sales_day: "2026-11-09", gross_inc_vat: 0, gross_exc_vat: 0, orders_count: 1 }), false);
  assert.equal(isFilled({ sales_day: "2026-11-08", gross_inc_vat: 2763, gross_exc_vat: 2549, orders_count: 150 }), true);
});

test("écart Belpeople − saisie, réutilisé de HubRise", () => {
  assert.deepEqual(gap(3000, 3000), { eur: 0, pct: 0 });
  assert.deepEqual(gap(3060, 3000), { eur: 60, pct: 2 });
});

import { revenueEntriesFrom, staleDays } from "./model";

const day = (sales_day: string, eur: number, orders: number) => ({ sales_day, gross_inc_vat: eur, gross_exc_vat: eur / 1.06, orders_count: orders });

test("seuls les jours remplis et terminés deviennent le CA du jour", () => {
  const rows = [day("2026-11-14", 800, 40), day("2026-11-09", 0, 0), day("2026-11-08", 2763, 150), day("2026-11-07", 3635.05, 190)];
  assert.deepEqual(revenueEntriesFrom(rows, "2026-11-14"), [
    { sales_day: "2026-11-08", amount: 2763, tickets: 150 },
    { sales_day: "2026-11-07", amount: 3635.05, tickets: 190 },
  ]);
});

test("un jour encore vide après 10 jours est signalé, pas avant", () => {
  const rows = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 14 - i)).toISOString().slice(0, 10);
    return day(d, d === "2026-11-01" || d >= "2026-11-09" ? 0 : 3000, d === "2026-11-01" || d >= "2026-11-09" ? 0 : 150);
  });
  // Le 09/11 → 14/11 sont vides mais récents ; le 01/11 a 13 jours : signalé.
  assert.deepEqual(staleDays(rows, "2026-11-14"), ["2026-11-01"]);
});

import { coversPlatforms, daysBelpeopleMayWrite } from "./model";

test("Belpeople ne remplace la saisie que s'il voit Uber Eats ou Deliveroo", () => {
  assert.equal(coversPlatforms(["Self-order kiosk", "UberEats", "Intake module"]), true); // Kraainem
  assert.equal(coversPlatforms(["Self-order kiosk", "Intake module", "TakeAway", null]), false); // Houba, De Bue
  assert.equal(coversPlatforms([]), false);
});

test("un jour saisi à la main n'est jamais écrasé par Belpeople", () => {
  const existing = [
    { sales_day: "2026-11-09", source: "console" },
    { sales_day: "2026-11-08", source: "belpeople" },
    { sales_day: "2026-11-07", source: null },
  ];
  assert.deepEqual(daysBelpeopleMayWrite(["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"], existing), ["2026-11-06", "2026-11-08"]);
});
