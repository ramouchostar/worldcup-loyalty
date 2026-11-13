import assert from "node:assert/strict";
import { test } from "node:test";
import type { OptionGroup } from "../menu-options/types";
import type { CatalogItem, OrderStatus } from "./order";
import { SiteOrdersUnavailableError, changeStatus, listRecentOrders, placeSiteOrder, type NewOrderRow, type OrderRow, type OrdersDb } from "./service";

class MemOrdersDb implements OrdersDb {
  rows: (OrderRow & { restaurant_id: string; order_day: string })[] = [];
  refusals: string[] = [];
  conflictsLeft = 0;
  unavailable = false;
  constructor(public catalog: CatalogItem[] = [], public trees = new Map<string, OptionGroup[]>()) {}
  private guard() { if (this.unavailable) throw new SiteOrdersUnavailableError(); }
  async loadCatalog(_r: string, ids: string[]) { return new Map(this.catalog.filter((c) => ids.includes(c.id)).map((c) => [c.id, c])); }
  async loadTrees() { return this.trees; }
  async lastNumber(r: string, day: string) { this.guard(); return Math.max(0, ...this.rows.filter((x) => x.restaurant_id === r && x.order_day === day).map((x) => x.number)); }
  async insert(row: NewOrderRow) {
    this.guard();
    if (this.conflictsLeft > 0) { this.conflictsLeft--; return { ok: false as const, conflict: true as const }; }
    const id = `o${this.rows.length + 1}`;
    this.rows.push({ id, restaurant_id: row.restaurant_id, order_day: row.order_day, number: row.number, first_name: row.first_name, phone: row.phone, lines: row.lines, total_cents: row.total_cents, status: "recue", created_at: "2026-11-13T12:00:00Z", ready_at: null, picked_up_at: null, cancelled_at: null, cancel_reason: null });
    return { ok: true as const, id };
  }
  async recordRefusal(_r: string, reason: string) { this.refusals.push(reason); }
  async listOrders(r: string) { return this.rows.filter((x) => x.restaurant_id === r); }
  async transition(r: string, id: string, from: OrderStatus, patch: Record<string, unknown>) {
    const row = this.rows.find((x) => x.id === id && x.restaurant_id === r && x.status === from);
    if (!row) return false;
    Object.assign(row, patch);
    return true;
  }
  async getStatus(r: string, id: string) { return (this.rows.find((x) => x.id === id && x.restaurant_id === r)?.status as OrderStatus | undefined) ?? null; }
}

const cola: CatalogItem = { id: "cola", name: "Coca-Cola", price: 2.5, active: true, zone: "Comptoir" };
const body = (extra: Record<string, unknown> = {}) => ({ firstName: "Amina", phone: "0470123456", lines: [{ articleId: "cola", qty: 2 }], ...extra });
const NOW = new Date("2026-11-13T12:00:00Z");

test("placeSiteOrder : écrit la commande, numéro du jour, prix recalculé", async () => {
  const db = new MemOrdersDb([cola]);
  const out = await placeSiteOrder(db, "r1", body(), NOW);
  assert.deepEqual(out, { ok: true, id: "o1", number: "0001", totalCents: 500 });
  const second = await placeSiteOrder(db, "r1", body(), NOW);
  assert.ok(second.ok);
  if (second.ok) assert.equal(second.number, "0002");
  assert.equal(db.rows[0].order_day, "2026-11-13");
  assert.equal(db.rows[0].total_cents, 500);
});

test("placeSiteOrder : le numéro repart de 1 le lendemain et par établissement", async () => {
  const db = new MemOrdersDb([cola]);
  await placeSiteOrder(db, "r1", body(), NOW);
  const other = await placeSiteOrder(db, "r2", body(), NOW);
  const next = await placeSiteOrder(db, "r1", body(), new Date("2026-11-14T12:00:00Z"));
  assert.ok(other.ok && next.ok);
  if (other.ok && next.ok) {
    assert.equal(other.number, "0001");
    assert.equal(next.number, "0001");
  }
});

test("placeSiteOrder : un conflit de numéro réessaie avec le suivant", async () => {
  const db = new MemOrdersDb([cola]);
  db.conflictsLeft = 2;
  const out = await placeSiteOrder(db, "r1", body(), NOW);
  assert.ok(out.ok);
});

test("placeSiteOrder : trop de conflits = 503 clair, rien d'écrit", async () => {
  const db = new MemOrdersDb([cola]);
  db.conflictsLeft = 10;
  const out = await placeSiteOrder(db, "r1", body(), NOW);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 503);
  assert.equal(db.rows.length, 0);
});

test("placeSiteOrder : demande illisible 400, plat inconnu 422, rien d'écrit", async () => {
  const db = new MemOrdersDb([cola]);
  const bad = await placeSiteOrder(db, "r1", { firstName: "", phone: "0470123456", lines: [] }, NOW);
  assert.equal(bad.ok, false);
  if (!bad.ok) { assert.equal(bad.status, 400); assert.equal(bad.code, "prenom"); }
  const unknown = await placeSiteOrder(db, "r1", body({ lines: [{ articleId: "fantome", qty: 1 }] }), NOW);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) { assert.equal(unknown.status, 422); assert.equal(unknown.code, "plat_inconnu"); }
  assert.equal(db.rows.length, 0);
});

test("placeSiteOrder : le plat d'un autre établissement n'existe pas pour celui-ci", async () => {
  const db = new MemOrdersDb([]);
  const out = await placeSiteOrder(db, "r1", body(), NOW);
  assert.equal(out.ok, false);
});

test("placeSiteOrder : tables absentes = 503 « pas encore activées »", async () => {
  const db = new MemOrdersDb([cola]);
  db.unavailable = true;
  const out = await placeSiteOrder(db, "r1", body(), NOW);
  assert.equal(out.ok, false);
  if (!out.ok) { assert.equal(out.status, 503); assert.match(out.message, /pas encore activées/); }
});

test("changeStatus : recue → prete → retiree, horodaté", async () => {
  const db = new MemOrdersDb([cola]);
  await placeSiteOrder(db, "r1", body(), NOW);
  assert.deepEqual(await changeStatus(db, "r1", "o1", "prete", null, NOW), { ok: true });
  assert.equal(db.rows[0].status, "prete");
  assert.equal(db.rows[0].ready_at, NOW.toISOString());
  assert.deepEqual(await changeStatus(db, "r1", "o1", "retiree", null, NOW), { ok: true });
  assert.equal(db.rows[0].picked_up_at, NOW.toISOString());
});

test("changeStatus : un saut d'état, un état inconnu, une autre enseigne sont refusés", async () => {
  const db = new MemOrdersDb([cola]);
  await placeSiteOrder(db, "r1", body(), NOW);
  const skip = await changeStatus(db, "r1", "o1", "retiree", null, NOW);
  assert.equal(skip.ok, false);
  if (!skip.ok) assert.equal(skip.status, 409);
  const unknown = await changeStatus(db, "r1", "o1", "recue", null, NOW);
  if (!unknown.ok) assert.equal(unknown.status, 400);
  const other = await changeStatus(db, "r2", "o1", "prete", null, NOW);
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.status, 404);
  assert.equal(db.rows[0].status, "recue");
});

test("changeStatus : l'annulation garde une raison nettoyée ; une commande retirée ne s'annule plus", async () => {
  const db = new MemOrdersDb([cola]);
  await placeSiteOrder(db, "r1", body(), NOW);
  await changeStatus(db, "r1", "o1", "annulee", "  <b>Plus   de poulet</b> ", NOW);
  assert.equal(db.rows[0].status, "annulee");
  assert.equal(db.rows[0].cancel_reason, "bPlus de poulet/b");
  const again = await changeStatus(db, "r1", "o1", "prete", null, NOW);
  assert.equal(again.ok, false);

  await placeSiteOrder(db, "r1", body(), NOW);
  await changeStatus(db, "r1", "o2", "prete", null, NOW);
  await changeStatus(db, "r1", "o2", "retiree", null, NOW);
  const late = await changeStatus(db, "r1", "o2", "annulee", "x", NOW);
  assert.equal(late.ok, false);
});

test("changeStatus : deux clics en même temps, le second trouve l'état déjà changé", async () => {
  const db = new MemOrdersDb([cola]);
  await placeSiteOrder(db, "r1", body(), NOW);
  const realTransition = db.transition.bind(db);
  db.transition = async (r, id, from, patch) => { await realTransition(r, id, from, patch); return realTransition(r, id, from, patch); };
  const out = await changeStatus(db, "r1", "o1", "prete", null, NOW);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 409);
});

test("listRecentOrders : lit les commandes figées (jamais de ligne illisible fatale)", async () => {
  const db = new MemOrdersDb([cola]);
  await placeSiteOrder(db, "r1", body(), NOW);
  db.rows[0].lines = "abîmé";
  const [o] = await listRecentOrders(db, "r1", NOW);
  assert.equal(o.number, "0001");
  assert.deepEqual(o.lines, []);
  assert.equal(o.status, "recue");
});
