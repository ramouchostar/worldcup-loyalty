import assert from "node:assert/strict";
import { test } from "node:test";
import type { OptionGroup } from "../menu-options/types";
import type { Openness } from "./hours";
import type { CatalogItem, OrderStatus } from "./order";
import { shouldOfferRescue } from "./rescue";
import { SiteOrdersUnavailableError, changeStatus, listRecentOrders, placeSiteOrder, type NewOrderRow, type OrderOffer, type OrderRow, type OrdersDb } from "./service";

class MemOrdersDb implements OrdersDb {
  rows: (OrderRow & { restaurant_id: string; order_day: string })[] = [];
  refusals: string[] = [];
  /** Le compte de chaque commande écrite (ADR 0108 §2), dans l'ordre. */
  members: (string | null)[] = [];
  conflictsLeft = 0;
  unavailable = false;
  /** Ce que la fiche dit : ouvert, sauf si un test dit autre chose. `null` = notre base est en panne. */
  openness: Openness | null = { state: "ouvert", closes: null };
  async readOpenness() { if (this.openness === null) throw new Error("base en panne"); return this.openness; }
  offers: OrderOffer[] | null = [];
  kept: string[][] = [];
  async liveOffers() { if (this.offers === null) throw new Error("offres illisibles"); return this.offers; }
  constructor(public catalog: CatalogItem[] = [], public trees = new Map<string, OptionGroup[]>()) {}
  private guard() { if (this.unavailable) throw new SiteOrdersUnavailableError(); }
  async loadCatalog(_r: string, ids: string[]) { return new Map(this.catalog.filter((c) => ids.includes(c.id)).map((c) => [c.id, c])); }
  async loadTrees() { return this.trees; }
  async lastNumber(r: string, day: string) { this.guard(); return Math.max(0, ...this.rows.filter((x) => x.restaurant_id === r && x.order_day === day).map((x) => x.number)); }
  async insert(row: NewOrderRow) {
    this.guard();
    if (this.conflictsLeft > 0) { this.conflictsLeft--; return { ok: false as const, conflict: true as const }; }
    const id = `o${this.rows.length + 1}`;
    this.members.push(row.member_id);
    this.kept.push(row.offer_ids);
    this.rows.push({ id, restaurant_id: row.restaurant_id, order_day: row.order_day, number: row.number, first_name: row.first_name, phone: row.phone, lines: row.lines, total_cents: row.total_cents, status: "recue", created_at: "2026-11-13T12:00:00Z", ready_at: null, picked_up_at: null, cancelled_at: null, cancel_reason: null });
    return { ok: true as const, id, linked: row.member_id !== null };
  }
  async recordRefusal(_r: string, reason: string) { this.refusals.push(reason); }
  async countRefusals() { const c: Record<string, number> = {}; for (const r of this.refusals) c[r] = (c[r] ?? 0) + 1; return c; }
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
  assert.deepEqual(out, { ok: true, id: "o1", number: "0001", totalCents: 500, linked: false, offers: [] }); // appel sans compte : pas de lien
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

test("placeSiteOrder : la commande garde le compte qui l'a envoyée (ADR 0108 §2), et le corps de la demande ne peut pas le dire", async () => {
  const db = new MemOrdersDb([cola]);
  const out = await placeSiteOrder(db, "r1", body({ memberId: "pirate", member_id: "pirate" }), NOW, "compte-1");
  assert.ok(out.ok);
  assert.deepEqual(db.members, ["compte-1"]); // seul le paramètre du serveur compte
  if (out.ok) assert.equal(out.linked, true);
});

test("placeSiteOrder : sans compte (appel interne), la commande n'est pas liée et ne promet pas de points", async () => {
  const db = new MemOrdersDb([cola]);
  const out = await placeSiteOrder(db, "r1", body(), NOW);
  assert.ok(out.ok);
  if (out.ok) assert.equal(out.linked, false);
});

test("placeSiteOrder : le téléphone est facultatif, la commande part sans", async () => {
  const db = new MemOrdersDb([cola]);
  const out = await placeSiteOrder(db, "r1", body({ phone: "" }), NOW, "compte-1");
  assert.ok(out.ok);
  assert.equal(db.rows[0].phone, null);
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

// ─── Les horaires (ADR 0108 §4, ADR 0109 §3) ─────────────────────────────────

test("placeSiteOrder : restaurant fermé selon sa fiche = refus « ferme », rien n'est écrit, et le secours WhatsApp ne s'ouvre pas", async () => {
  const db = new MemOrdersDb([cola]);
  db.openness = { state: "ferme", opens: { day: "2026-11-14", time: "11:00", at: "2026-11-14T10:00:00.000Z" } };
  const out = await placeSiteOrder(db, "r1", body(), NOW, "u1");
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.code, "ferme");
  assert.equal(out.status, 409);
  assert.match(out.message, /ouvre demain à 11:00/);
  assert.match(out.message, /panier est gardé/);
  assert.equal(db.rows.length, 0);
  assert.equal(shouldOfferRescue(out.status, out.code), false);
});

test("placeSiteOrder : horaires inconnus = aucune commande, motif « horaires_inconnus », la réponse dit d'appeler", async () => {
  const db = new MemOrdersDb([cola]);
  db.openness = { state: "inconnu" };
  const out = await placeSiteOrder(db, "r1", body(), NOW, "u1");
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.code, "horaires_inconnus");
  assert.equal(out.status, 409);
  assert.match(out.message, /Appelle/);
  assert.equal(db.rows.length, 0);
  assert.equal(shouldOfferRescue(out.status, out.code), false);
});

test("placeSiteOrder : une panne de notre base pendant la lecture des horaires reste « indisponible » (le secours s'ouvre)", async () => {
  const db = new MemOrdersDb([cola]);
  db.openness = null;
  const out = await placeSiteOrder(db, "r1", body(), NOW, "u1");
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.code, "indisponible");
  assert.equal(shouldOfferRescue(out.status, out.code), true);
  assert.equal(db.rows.length, 0);
});

test("placeSiteOrder : une demande mal formée est refusée avant toute lecture de la fiche (elle ne coûte rien)", async () => {
  const db = new MemOrdersDb([cola]);
  let reads = 0;
  db.readOpenness = async () => { reads++; return { state: "ouvert", closes: null }; };
  await placeSiteOrder(db, "r1", body({ firstName: " " }), NOW, "u1");
  assert.equal(reads, 0);
});

// ─── Les offres (ADR 0110) : elles accompagnent la commande, elles ne touchent aucun prix. ───

const FRITES: OrderOffer = { id: "11111111-1111-4111-8111-111111111111", title: "Frites offertes au comptoir", conditions: "Avec un menu." };

test("une offre valable est gardée avec la commande et rappelée, sans changer le total", async () => {
  const sans = new MemOrdersDb([cola]);
  const avec = new MemOrdersDb([cola]);
  avec.offers = [FRITES];
  const a = await placeSiteOrder(sans, "r1", body(), NOW);
  const b = await placeSiteOrder(avec, "r1", body(), NOW);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.equal(b.totalCents, a.totalCents);
  assert.deepEqual(avec.rows[0].lines, sans.rows[0].lines);
  assert.deepEqual(avec.kept, [[FRITES.id]]);
  assert.deepEqual(b.offers, [FRITES]);
  assert.deepEqual(a.offers, []);
});

test("des offres illisibles ne font jamais perdre une commande", async () => {
  const db = new MemOrdersDb([cola]);
  db.offers = null;
  const out = await placeSiteOrder(db, "r1", body(), NOW);
  assert.ok(out.ok);
  assert.deepEqual(db.kept, [[]]);
});

test("des offres qui n'ont pas pu être gardées avec la commande ne sont pas rappelées au client", async () => {
  const db = new MemOrdersDb([cola]);
  db.offers = [FRITES];
  const insert = db.insert.bind(db);
  db.insert = async (row) => { const r = await insert(row); return r.ok ? { ...r, offersKept: false } : r; };
  const out = await placeSiteOrder(db, "r1", body(), NOW);
  assert.deepEqual(out.ok && out.offers, []);
});
