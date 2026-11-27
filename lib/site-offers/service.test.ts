import assert from "node:assert/strict";
import { test } from "node:test";
import { gateByOffer, offerArticleNotes } from "../restaurant-posts/offer-gate";
import type { OrderView } from "../site-orders/service";
import { consoleOffers, withOffers } from "./console";
import type { OfferAnswer, OfferRow } from "./offers";
import { answerOffer, liveOffers, publicOffers, publishOffer, recordSeen, saveDraft, stopOffer, type NewOffer, type OffersDb } from "./service";

const R = "resto";
const USER = "gerant-1";
const NOW = new Date("2026-11-27T11:00:00Z");
const TODAY = "2026-11-27";
const DISH = "33333333-3333-4333-8333-333333333333";
const OTHER_DISH = "44444444-4444-4444-8444-444444444444";
const ORDER = "55555555-5555-4555-8555-555555555555";

function memory() {
  const rows = new Map<string, OfferRow>();
  const seen: [string, string][] = [];
  const answers = new Map<string, OfferAnswer>();
  const orders = new Map<string, string[]>([[ORDER, []]]);
  const dishes = new Map([[DISH, "Menu poulet"], [OTHER_DISH, "Frites"]]);
  const state = { hidden: new Set<string>(), down: false };
  let n = 0;
  const guard = () => { if (state.down) throw new Error("base en panne"); };
  const db: OffersDb = {
    async list(r) { guard(); return [...rows.values()].filter((o) => o.restaurant_id === r); },
    async published(r, since) { guard(); return [...rows.values()].filter((o) => o.restaurant_id === r && o.state === "publiee" && o.last_day >= since); },
    async get(r, id) { guard(); const o = rows.get(id); return o && o.restaurant_id === r ? { ...o } : null; },
    async byIds(r, ids) { guard(); return [...rows.values()].filter((o) => o.restaurant_id === r && ids.includes(o.id)); },
    async insert(row: NewOffer) {
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const full: OfferRow = { ...row, id, state: "brouillon", created_at: NOW.toISOString(), updated_at: NOW.toISOString(), published_by: null, published_at: null, stopped_by: null, stopped_at: null, stop_reason: null };
      rows.set(id, full);
      return { ...full };
    },
    async update(id, patch, expect) { const o = rows.get(id); if (!o || o.state !== expect) return null; Object.assign(o, patch); return { ...o }; },
    async orderable(_r, ids) { guard(); return new Set(ids.filter((i) => dishes.has(i) && !state.hidden.has(i))); },
    async dishNames(_r, ids) { return new Map(ids.flatMap((i) => (dishes.has(i) ? [[i, dishes.get(i)!] as const] : []))); },
    async addSeen(_r, kind, ids) { for (const id of ids) seen.push([kind, id]); },
    async saveAnswer({ orderId, offerId, answer }) { answers.set(`${orderId}/${offerId}`, answer); },
    async orderOfferIds(_r, id) { return orders.get(id) ?? null; },
  };
  return { db, rows, seen, answers, orders, state };
}

type Mem = ReturnType<typeof memory>;
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.ok(r.ok, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const raw = (over: Record<string, unknown> = {}) => ({ title: "Frites offertes", conditions: "Avec un menu.", itemId: DISH, firstDay: TODAY, lastDay: "2026-12-05", weekdays: [1, 2, 3, 4, 5, 6, 7], ...over });
const draft = async (m: Mem, over: Record<string, unknown> = {}) => ok(await saveDraft(m.db, { restaurantId: R, userId: USER, raw: raw(over), now: NOW })).offer;
const publish = (m: Mem, id: string, teamConfirmed = true) => publishOffer(m.db, { restaurantId: R, userId: USER, id, teamConfirmed, now: NOW });
const published = async (m: Mem, over: Record<string, unknown> = {}) => ok(await publish(m, (await draft(m, over)).id)).offer;

test("rien n'est public sans « Oui » : un brouillon ne se voit pas ; publier demande la case, et dit qui et quand", async () => {
  const m = memory();
  const d = await draft(m);
  assert.deepEqual(await publicOffers(m.db, R, NOW), []);
  const refused = await publish(m, d.id, false);
  assert.equal(refused.ok, false);
  const o = ok(await publish(m, d.id)).offer;
  assert.deepEqual([o.state, o.published_by, o.published_at], ["publiee", USER, NOW.toISOString()]);
  assert.deepEqual((await publicOffers(m.db, R, NOW)).map((x) => x.title), ["Frites offertes"]);
});

test("une offre publiée ne se modifie pas ; reprendre une offre arrêtée fait un nouveau brouillon qui la cite", async () => {
  const m = memory();
  const o = await published(m);
  const edit = await saveDraft(m.db, { restaurantId: R, userId: USER, id: o.id, raw: raw({ title: "Autre" }), now: NOW });
  assert.equal(edit.ok, false);
  assert.equal((await publish(m, o.id)).ok, false);
  ok(await stopOffer(m.db, { restaurantId: R, userId: "equipe-1", id: o.id, reason: "equipe", now: NOW }));
  const stopped = m.rows.get(o.id)!;
  assert.deepEqual([stopped.state, stopped.stopped_by, stopped.stop_reason], ["arretee", "equipe-1", "equipe"]);
  assert.deepEqual(await liveOffers(m.db, R, NOW), []);
  const copy = ok(await saveDraft(m.db, { restaurantId: R, userId: USER, copiedFrom: o.id, raw: raw(), now: NOW })).offer;
  assert.deepEqual([copy.state, copy.copied_from === o.id, copy.id !== o.id], ["brouillon", true, true]);
});

test("arrêter demande une raison, et seulement une offre en cours ou à venir", async () => {
  const m = memory();
  const o = await published(m);
  assert.equal((await stopOffer(m.db, { restaurantId: R, userId: USER, id: o.id, reason: "parce que", now: NOW })).ok, false);
  assert.equal((await stopOffer(m.db, { restaurantId: R, userId: USER, id: o.id, reason: "stock", now: new Date("2026-12-07T10:00:00Z") })).ok, false);
  assert.equal((await stopOffer(m.db, { restaurantId: "autre", userId: USER, id: o.id, reason: "stock", now: NOW })).ok, false);
});

test("publier : plat commandable, dates à venir, trois offres au plus", async () => {
  const m = memory();
  const hidden = await draft(m);
  m.state.hidden.add(DISH);
  const r = await publish(m, hidden.id);
  assert.match(r.ok ? "" : r.error, /n'est pas proposé à la commande/);
  m.state.hidden.clear();
  const old = await draft(m, { lastDay: TODAY });
  const late = await publishOffer(m.db, { restaurantId: R, userId: USER, id: old.id, teamConfirmed: true, now: new Date("2026-11-28T10:00:00Z") });
  assert.match(late.ok ? "" : late.error, /passé/);
  for (let i = 0; i < 3; i++) await published(m, { title: `Offre ${i}` });
  const fourth = await publish(m, (await draft(m, { title: "Quatrième" })).id);
  assert.match(fourth.ok ? "" : fourth.error, /déjà 3 offres le 27 novembre/);
  assert.equal((await saveDraft(m.db, { restaurantId: R, userId: USER, raw: raw({ itemId: "99999999-9999-4999-8999-999999999999" }), now: NOW })).ok, false);
});

test("le client voit l'offre ses jours seulement ; le lendemain du dernier jour, le serveur ne la renvoie plus", async () => {
  const m = memory();
  await published(m, { lastDay: "2026-11-28" });
  assert.equal((await publicOffers(m.db, R, NOW)).length, 1);
  assert.equal((await publicOffers(m.db, R, new Date("2026-11-28T22:30:00Z"))).length, 1); // 23 h 30 à Bruxelles
  assert.equal((await publicOffers(m.db, R, new Date("2026-11-28T23:30:00Z"))).length, 0); // 0 h 30 le lendemain
  m.state.hidden.add(DISH);
  assert.equal((await publicOffers(m.db, R, NOW)).length, 0);
});

test("affichages et ouvertures : comptés seulement pour une offre montrée en ce moment", async () => {
  const m = memory();
  const o = await published(m);
  const d = await draft(m);
  assert.deepEqual(await recordSeen(m.db, { restaurantId: R, kind: "affichee", offerIds: [o.id, d.id, "x"], now: NOW }), { ok: true, counted: 1 });
  ok(await recordSeen(m.db, { restaurantId: R, kind: "ouverte", offerIds: [o.id], now: NOW }));
  assert.deepEqual(m.seen, [["affichee", o.id], ["ouverte", o.id]]);
  for (const bad of [{ kind: "appliquee", offerIds: [o.id] }, { kind: "affichee", offerIds: [] }, { kind: "affichee", offerIds: "x" }]) {
    assert.equal((await recordSeen(m.db, { restaurantId: R, ...bad, now: NOW })).ok, false);
  }
});

test("au comptoir : la réponse n'est prise que pour une offre affichée à cette commande, et se corrige", async () => {
  const m = memory();
  const o = await published(m);
  const body = { restaurantId: R, orderId: ORDER, offerId: o.id, now: NOW };
  assert.equal((await answerOffer(m.db, { ...body, answer: "appliquee" })).ok, false);
  m.orders.set(ORDER, [o.id]);
  ok(await answerOffer(m.db, { ...body, answer: "appliquee" }));
  ok(await answerOffer(m.db, { ...body, answer: "pas_appliquee" }));
  assert.equal(m.answers.get(`${ORDER}/${o.id}`), "pas_appliquee");
  assert.equal((await answerOffer(m.db, { ...body, answer: "peut-être" })).ok, false);
});

test("la carte d'une commande garde son offre même arrêtée ; illisible, elle le dit", async () => {
  const m = memory();
  const o = await published(m);
  await stopOffer(m.db, { restaurantId: R, userId: USER, id: o.id, reason: "stock", now: NOW });
  const order = { id: ORDER, offerIds: [o.id] } as OrderView;
  const [card] = withOffers([order], [m.rows.get(o.id)!], new Map([[`${ORDER}/${o.id}`, "appliquee"]]));
  assert.deepEqual([card.offers, card.offersUnreadable], [[{ id: o.id, title: "Frites offertes", conditions: "Avec un menu.", answer: "appliquee" }], false]);
  assert.deepEqual(withOffers([order], null, new Map())[0].offersUnreadable, true);
  assert.deepEqual(withOffers([{ ...order, offerIds: [] }], null, new Map())[0].offersUnreadable, false);
});

test("l'écran des offres : états, phrases, chiffres, et pourquoi une offre est masquée", async () => {
  const m = memory();
  const live = await published(m);
  const d = await draft(m, { title: "Brouillon", itemId: "" });
  const view = (hidden: boolean) =>
    consoleOffers([m.rows.get(live.id)!, m.rows.get(d.id)!], {
      today: TODAY, orderable: new Set(hidden ? [] : [DISH]), dishNames: new Map([[DISH, "Menu poulet"]]), firstNames: new Map([[USER, "Amina"]]),
      counts: new Map([[live.id, { seen: 4, opened: 1, orders: 2 }]]),
    });
  const [first, second] = view(false);
  assert.deepEqual([first.phase, first.status, first.line, first.counts], ["en_cours", "En cours", "Jusqu'au 5 décembre inclus. Publiée par Amina le 27 novembre.", "Affichée 4 fois, ouverte 1 fois, 2 commandes reçues pendant l'offre."]);
  assert.deepEqual([second.phase, second.counts, second.line], ["brouillon", null, null]);
  assert.equal(view(true)[0].warning, "Tes clients ne la voient pas : le plat « Menu poulet » n'est plus proposé à la commande.");
});

test("un article d'offre se lit tant que l'offre tient ; illisibles, les offres cachent leurs articles", async () => {
  const m = memory();
  const o = await published(m);
  const rows = [{ id: "p1", offer_id: o.id, status: "en_ligne" as const }, { id: "p2", offer_id: null, status: "en_ligne" as const }];
  const shown = async () => (await gateByOffer(R, rows, NOW, m.db)).map((r) => r.id);
  assert.deepEqual(await shown(), ["p1", "p2"]);
  m.state.hidden.add(DISH);
  assert.deepEqual(await shown(), ["p2"]);
  assert.match((await offerArticleNotes(R, rows, NOW, m.db)).get("p1")!, /ne le voient pas/);
  m.state.hidden.clear();
  await stopOffer(m.db, { restaurantId: R, userId: USER, id: o.id, reason: "erreur", now: NOW });
  assert.deepEqual(await shown(), ["p2"]);
  assert.match((await offerArticleNotes(R, [{ ...rows[0], status: "retire" }], NOW, m.db)).get("p1")!, /arrêtée/);
  m.state.down = true;
  assert.deepEqual(await shown(), ["p2"]);
  assert.deepEqual((await gateByOffer(R, [rows[1]], NOW, m.db)).map((r) => r.id), ["p2"]); // sans offre citée, aucune lecture
});
