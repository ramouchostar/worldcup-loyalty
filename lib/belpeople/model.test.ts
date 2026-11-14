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
