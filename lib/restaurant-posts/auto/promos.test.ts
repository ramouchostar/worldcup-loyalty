// ADR 0110, 0112 — « un article à chaque promo » : de l'offre publiée à l'article, et son retrait dès que l'offre s'arrête.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { OfferRow } from "../../site-offers/offers";
import { readableByOffer } from "../offer-gate";
import { findOnlinePost, publishPost } from "../service";
import { nextVersion, publishNow, saveAutoSettings, stopOfferArticles } from "./actions";
import { runAuto } from "./engine";
import { sourceDetails } from "./phrases";
import { promoKey } from "./sources/promos";
import { DISH_ID, RESTO, at10, at17, world } from "./testing";

const THU = "2026-11-26";
const FRI = "2026-11-27";
const SAT = "2026-11-28";
const SUN = "2026-11-29";
const MON = "2026-11-30";
const TUE = "2026-12-01";
const USER = "gerant-1";
const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

type World = ReturnType<typeof world>;
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.ok(r.ok, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const run = (w: World, now: Date) => { w.state.now = now; return runAuto(w.deps()); };
const one = (w: World) => { assert.equal(w.list().length, 1, JSON.stringify(w.list())); return w.list()[0]; };

const offer = (over: Partial<OfferRow> = {}): OfferRow => ({
  id: ID, restaurant_id: RESTO, title: "Frites offertes avec le menu poulet", conditions: null, menu_item_id: DISH_ID, first_day: SAT, last_day: "2026-12-05", weekdays: null,
  state: "publiee", created_by: USER, created_at: THU, published_by: USER, published_at: `${THU}T10:00:00Z`, stopped_by: null, stopped_at: null, stop_reason: null,
  copied_from: null, updated_at: THU, ...over,
});

async function setup(...offers: OfferRow[]) {
  const w = world();
  w.state.offersOff = null;
  for (const o of offers) w.state.offers.set(o.id, o);
  w.state.now = at17(THU);
  ok(await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: USER, kinds: ["promo"], accepted: true }));
  return w;
}

async function notified(over: Partial<OfferRow> = {}) {
  const w = await setup(offer(over));
  await run(w, at17(FRI));
  assert.equal(w.sent.length, 1, JSON.stringify(w.list()));
  return w;
}

const stop = (w: World, id = ID) => w.state.offers.set(id, { ...w.state.offers.get(id)!, state: "arretee", stopped_at: w.state.now.toISOString(), stop_reason: "stock" });

test("une offre publiée donne un article : prévenu la veille, publié un jour où elle vaut, fini avec elle", async () => {
  const w = await notified();
  const o = one(w);
  assert.deepEqual([o.kind, o.source_key, o.status, o.publish_day], ["promo", promoKey(ID), "prevenu", SAT]);
  assert.equal(o.expires_at, "2026-12-05T23:00:00.000Z"); // minuit à la fin du dernier jour, à Bruxelles
  const draft = w.posts.get(o.post_id!)!;
  assert.equal(draft.offer_id, ID);
  assert.deepEqual(draft.draft_blocks.at(-1), { type: "dish", itemId: DISH_ID });
  assert.match(JSON.stringify(draft.draft_blocks), /au comptoir/);
  assert.match(sourceDetails(o.facts, { hasDish: true, offerings: w.state.offerings, expiresAt: o.expires_at }).at(-1)!, /samedi 5 décembre au soir, ou dès que ton offre s'arrête/);

  assert.equal((await run(w, at10(SAT))).published, 1);
  const post = w.posts.get(o.post_id!)!;
  assert.deepEqual([post.status, post.expires_at], ["en_ligne", o.expires_at]);
  // Une seule occasion par offre : les jours suivants, rien de plus.
  await run(w, at17(SAT));
  await run(w, at17(SUN));
  assert.equal(w.list().length, 1);
});

test("le premier jour déjà passé au préavis : un jour suivant encore valable", async () => {
  const w = await setup(offer({ first_day: THU }));
  await run(w, at17(FRI));
  assert.equal(one(w).publish_day, SAT);
});

test("les jours de la semaine comptent ; sans jour dans les trois prochains, on attend sans rien écarter", async () => {
  const w = await setup(offer({ weekdays: [2], first_day: THU, last_day: "2026-12-15" })); // le mardi
  await run(w, at17(THU));
  assert.equal(w.list().length, 0);
  await run(w, at17(MON));
  assert.deepEqual([one(w).publish_day, one(w).status], [TUE, "prevenu"]);
});

test("une offre qui ne vaut que le jour de sa publication, après 17 h, n'a pas d'article", async () => {
  const w = await setup(offer({ first_day: FRI, last_day: FRI }));
  await run(w, at17(FRI));
  assert.equal(w.list().length, 0);
});

test("deux offres : un article par jour, la seconde prend un jour suivant ; la plus courte d'abord", async () => {
  const w = await setup(offer({ id: ID, last_day: "2026-12-05" }), offer({ id: ID2, title: "Boisson offerte avec un menu", last_day: SUN }));
  await run(w, at17(FRI));
  assert.deepEqual(w.list().map((o) => [o.facts.kind === "promo" && o.facts.offerId, o.publish_day]).sort(), [[ID, SUN], [ID2, SAT]]);
});

test("sans place maintenant mais avec des jours plus tard : l'offre n'est pas écartée pour de bon", async () => {
  const w = await setup(offer({ id: ID2, title: "Boisson offerte avec un menu", first_day: SAT, last_day: SAT }), offer({ weekdays: [6], last_day: "2026-12-12" }));
  await run(w, at17(FRI));
  assert.deepEqual(w.list().map((o) => o.publish_day), [SAT]);
});

test("arrêtée entre le préavis et la publication : rien ne paraît", async () => {
  const w = await notified();
  stop(w);
  await run(w, at10(SAT));
  assert.deepEqual([one(w).status, one(w).reason], ["ecarte", "promo_finie"]);
  assert.equal(w.posts.size, 0);
});

test("titre ou dates qui ne sont plus les mêmes, plat retiré : écarté avec sa raison", async () => {
  for (const [change, reason] of [
    [(w: World) => w.state.offers.set(ID, offer({ title: "Autre titre" })), "promo_changee"],
    [(w: World) => w.state.offers.set(ID, offer({ last_day: "2026-12-04" })), "promo_changee"],
    [(w: World) => w.state.hiddenDishes.add(DISH_ID), "promo_plat"],
    [(w: World) => w.state.offers.delete(ID), "promo_finie"],
  ] as const) {
    const w = await notified();
    change(w);
    await run(w, at10(SAT));
    assert.deepEqual([one(w).status, one(w).reason], ["ecarte", reason]);
  }
});

test("le plat revenu avant un jour valable : l'occasion est reproposée", async () => {
  const w = await notified();
  w.state.hiddenDishes.add(DISH_ID);
  await run(w, at10(SAT));
  w.state.hiddenDishes.clear();
  await run(w, at17(SAT));
  assert.deepEqual([one(w).status, one(w).publish_day], ["prevenu", SUN]);
});

test("offres illisibles : rien ne paraît, et ce n'est pas dit « arrêtée »", async () => {
  const w = await notified();
  w.state.offersDown = true;
  await run(w, at10(SAT));
  assert.equal(one(w).reason, "source_indisponible");
});

test("« Publier maintenant » demande que l'offre vaille aujourd'hui ; sinon l'article attend son jour", async () => {
  const w = await notified();
  const o = one(w);
  const post = w.posts.get(o.post_id!)!;
  w.state.now = at17(FRI); // la veille du premier jour
  const early = await publishNow(w.deps(), o, { userId: USER, revision: post.revision, rightsConfirmed: false });
  assert.equal(early.ok, false);
  assert.match(early.ok ? "" : early.error, /ne vaut pas aujourd'hui/);
  assert.equal(one(w).status, "prevenu");
  w.state.now = at10(SAT);
  ok(await publishNow(w.deps(), one(w), { userId: USER, revision: post.revision, rightsConfirmed: false }));
  assert.equal(w.posts.get(o.post_id!)!.status, "en_ligne");
});

test("« Publier maintenant » après l'arrêt : refusé et écarté", async () => {
  const w = await notified();
  const o = one(w);
  stop(w);
  w.state.now = at10(SAT);
  const res = await publishNow(w.deps(), o, { userId: USER, revision: 1, rightsConfirmed: false });
  assert.equal(res.ok, false);
  assert.deepEqual([one(w).status, one(w).reason], ["ecarte", "promo_finie"]);
});

test("« Autre version » garde le plat de l'offre", async () => {
  const w = await notified();
  const o = one(w);
  const saved = ok(await nextVersion(w.deps(), { restaurantId: RESTO, postId: o.post_id!, revision: 1 }));
  assert.deepEqual(saved.post.draft_blocks.filter((b) => b.type === "dish"), [{ type: "dish", itemId: DISH_ID }]);
});

test("arrêter l'offre retire aussitôt l'article en ligne, et il ne se republie plus", async () => {
  const w = await notified();
  const o = one(w);
  await run(w, at10(SAT));
  const online = w.posts.get(o.post_id!)!;
  assert.ok(await findOnlinePost(w.deps().posts, RESTO, online.slug, w.state.now));
  stop(w);
  // Avant même le rangement, la lecture publique le cache.
  assert.deepEqual(readableByOffer([online], [...w.state.offers.values()], new Set([DISH_ID]), SAT), []);
  const res = await stopOfferArticles(w.deps(), { restaurantId: RESTO, offerId: ID, userId: USER });
  assert.equal(res.withdrawn, 1);
  const withdrawn = w.posts.get(o.post_id!)!;
  assert.equal(withdrawn.status, "retire");
  assert.ok(w.events.some((e) => e.kind === "retire" && e.reason === "offre_arretee"));
  const again = await publishPost(w.deps().posts, { restaurantId: RESTO, postId: withdrawn.id, userId: USER, revision: withdrawn.revision, rightsConfirmed: false, dishIds: new Set([DISH_ID]), now: w.state.now });
  assert.equal(again.ok, false);
  assert.match(again.ok ? "" : again.error, /arrêtée ou terminée/);
});

test("arrêter l'offre écarte l'article qui attendait", async () => {
  const w = await notified();
  stop(w);
  await stopOfferArticles(w.deps(), { restaurantId: RESTO, offerId: ID, userId: USER });
  assert.deepEqual([one(w).status, one(w).reason], ["ecarte", "promo_finie"]);
});

test("après le dernier jour valable, l'article ne se lit plus", async () => {
  const w = await notified({ weekdays: [6], last_day: "2026-12-04" }); // un seul samedi
  const o = one(w);
  assert.equal(o.expires_at, "2026-11-28T23:00:00.000Z");
  await run(w, at10(SAT));
  const post = w.posts.get(o.post_id!)!;
  assert.ok(await findOnlinePost(w.deps().posts, RESTO, post.slug, w.state.now));
  assert.equal(await findOnlinePost(w.deps().posts, RESTO, post.slug, new Date("2026-11-29T08:00:00Z")), null);
});

test("un titre avec un prix : pas d'article, et « Pas publiés » dit pourquoi", async () => {
  const w = await setup(offer({ title: "Menu poulet à 9,90 €" }));
  await run(w, at17(FRI));
  assert.deepEqual([one(w).status, one(w).reason], ["ecarte", "controle"]);
  assert.match(one(w).reason_detail ?? "", /prix/);
  assert.equal(w.sent.length, 0);
});

test("un restaurant qui avait activé sans « Mes promos » n'a pas d'article tant qu'il ne la coche pas", async () => {
  const w = world();
  w.state.offersOff = null;
  w.state.offers.set(ID, offer());
  w.state.now = at17(THU);
  ok(await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: USER, kinds: ["evenement"], accepted: true }));
  await run(w, at17(FRI));
  assert.equal(w.list().length, 0);
  // Cocher suffit : la phrase d'acceptation n'a pas changé.
  ok(await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: USER, kinds: ["evenement", "promo"], accepted: false }));
  await run(w, at17(FRI));
  assert.equal(one(w).kind, "promo");
});
