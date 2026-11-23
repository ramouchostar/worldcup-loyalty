import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SITE_ORDER_LIVE_STATUSES, SITE_ORDER_POINTS_REASON, SITE_ORDER_RECENT_FLAG, SITE_ORDER_TICKET_WINDOW_HOURS, recentSiteOrderSince } from "./points";
import { isOrderStatus } from "./order";

const MIGRATION = readFileSync(join(__dirname, "../../docs/migrations/20261123-1000-site-order-points.sql"), "utf8");

test("recentSiteOrderSince : six heures avant l'instant donné", () => {
  const now = new Date("2026-11-23T14:00:00.000Z");
  assert.equal(recentSiteOrderSince(now), "2026-11-23T08:00:00.000Z");
  assert.equal(SITE_ORDER_TICKET_WINDOW_HOURS, 6);
});

test("la fenêtre de l'application est celle de la migration (deux endroits, une seule valeur)", () => {
  const windows = [...MIGRATION.matchAll(/INTERVAL '(\d+) hours'/g)].map((m) => Number(m[1]));
  // Les deux bornes du « même repas » valent la fenêtre ; le délai de disponibilité des points (4 h) est l'autre durée du fichier.
  assert.equal(windows.filter((h) => h === SITE_ORDER_TICKET_WINDOW_HOURS).length, 2);
  assert.deepEqual([...new Set(windows)].sort((a, b) => a - b), [4, SITE_ORDER_TICKET_WINDOW_HOURS]);
});

test("la raison du crédit et le motif de revue sont ceux que la migration et l'écran du restaurateur connaissent", () => {
  assert.ok(MIGRATION.includes(`'${SITE_ORDER_POINTS_REASON}'`));
  assert.ok(SITE_ORDER_RECENT_FLAG.length > 0 && (SITE_ORDER_RECENT_FLAG as string) !== (SITE_ORDER_POINTS_REASON as string));
  const adminPage = readFileSync(join(__dirname, "../../app/admin/[restaurantId]/orders/page.tsx"), "utf8");
  assert.ok(adminPage.includes(SITE_ORDER_RECENT_FLAG), "le restaurateur doit voir un libellé pour ce motif");
  const pointsPage = readFileSync(join(__dirname, "../../app/r/[restaurantId]/points/page.tsx"), "utf8");
  assert.ok(pointsPage.includes(SITE_ORDER_POINTS_REASON), "le membre doit voir un libellé pour cette ligne de son historique");
});

test("les états « un repas en cours ou fait » sont de vrais états, et jamais « annulée »", () => {
  for (const s of SITE_ORDER_LIVE_STATUSES) assert.ok(isOrderStatus(s), s);
  assert.ok(!(SITE_ORDER_LIVE_STATUSES as readonly string[]).includes("annulee"));
});

test("la migration crédite à la remise seulement, jamais à l'envoi, et ne bloque jamais la remise", () => {
  assert.ok(/v_status <> 'retiree'/.test(MIGRATION)); // seule une commande retirée rapporte
  assert.ok(/NEW\.status = 'retiree' AND OLD\.status IS DISTINCT FROM 'retiree'/.test(MIGRATION)); // une seule fois, au passage
  assert.ok(/EXCEPTION WHEN OTHERS THEN/.test(MIGRATION) && /RAISE WARNING/.test(MIGRATION)); // un échec de crédit est dit, pas fatal
  assert.ok(/ON CONFLICT \(site_order_id\) WHERE reason = 'site_order_points' DO NOTHING/.test(MIGRATION)); // un crédit par commande
  assert.ok(!/AFTER INSERT/.test(MIGRATION)); // pas de crédit à l'envoi
  assert.ok(/AFTER UPDATE OF status ON site_orders/.test(MIGRATION) && /WHEN \(NEW\.status = 'retiree'/.test(MIGRATION)); // seulement un changement d'état
  assert.ok(/o\.status = 'validated'/.test(MIGRATION) && !/o\.status IN \('validated', 'pending'\)/.test(MIGRATION)); // un ticket en attente ne neutralise pas les points
});
