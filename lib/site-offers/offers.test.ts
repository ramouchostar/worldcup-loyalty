import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkOfferFields, coversDay, crowdedDay, forbiddenWord, lastValidDay, offerPhase, publicOffer, validDays, visibleOffers, weekdayOf, whenLong, whenShort,
  type OfferRow,
} from "./offers";

const TODAY = "2026-11-27"; // vendredi
const DISH = "33333333-3333-4333-8333-333333333333";
const offer = (over: Partial<OfferRow> = {}): OfferRow => ({
  id: "a", restaurant_id: "r", title: "Frites offertes", conditions: null, menu_item_id: null, first_day: TODAY, last_day: "2026-12-05", weekdays: null,
  state: "publiee", created_by: null, created_at: TODAY, published_by: null, published_at: `${TODAY}T08:00:00Z`, stopped_by: null, stopped_at: null,
  stop_reason: null, copied_from: null, updated_at: TODAY, ...over,
});

test("une offre vaut ses jours, bornes comprises, et ses jours de la semaine seulement", () => {
  assert.equal(weekdayOf(TODAY), 5);
  const mardis = offer({ weekdays: [2], first_day: "2026-12-01", last_day: "2026-12-13" });
  assert.deepEqual(validDays(mardis), ["2026-12-01", "2026-12-08"]);
  assert.equal(lastValidDay(mardis), "2026-12-08");
  assert.equal(coversDay(mardis, "2026-12-01"), true);
  assert.equal(coversDay(mardis, "2026-12-02"), false);
  assert.equal(coversDay(offer(), "2026-12-05"), true);
  assert.equal(coversDay(offer(), "2026-12-06"), false);
});

test("le client voit les offres du jour : trois au plus, celle qui finit le plus tôt d'abord, jamais un plat masqué", () => {
  const list = [
    offer({ id: "longue", last_day: "2026-12-10" }),
    offer({ id: "jour", last_day: TODAY }),
    offer({ id: "demain", first_day: "2026-11-28" }),
    offer({ id: "brouillon", state: "brouillon" }),
    offer({ id: "arretee", state: "arretee" }),
    offer({ id: "finie", first_day: "2026-11-20", last_day: "2026-11-26" }),
    offer({ id: "plat-ok", menu_item_id: DISH, last_day: "2026-12-01" }),
    offer({ id: "plat-masque", menu_item_id: "44444444-4444-4444-8444-444444444444" }),
    offer({ id: "quatrieme", last_day: "2026-12-12" }),
    offer({ id: "pas-aujourdhui", weekdays: [1] }),
  ];
  assert.deepEqual(visibleOffers(list, TODAY, new Set([DISH])).map((o) => o.id), ["jour", "plat-ok", "longue"]);
});

test("trois offres au plus le même jour : la quatrième est refusée le jour où elle déborde", () => {
  const three = ["a", "b", "c"].map((id) => offer({ id, first_day: "2026-12-01", last_day: "2026-12-03" }));
  const next = offer({ id: "d", state: "brouillon", first_day: "2026-11-28", last_day: "2026-12-02" });
  assert.equal(crowdedDay(next, three, TODAY), "2026-12-01");
  assert.equal(crowdedDay({ ...next, last_day: "2026-11-30" }, three, TODAY), null);
  assert.equal(crowdedDay(next, [...three.slice(0, 2), { ...three[2], state: "arretee" }], TODAY), null);
});

test("l'état montré à la console se déduit des dates et de la carte", () => {
  const none = new Set<string>();
  assert.equal(offerPhase(offer({ state: "brouillon" }), TODAY, none), "brouillon");
  assert.equal(offerPhase(offer({ state: "arretee" }), TODAY, none), "arretee");
  assert.equal(offerPhase(offer(), TODAY, none), "en_cours");
  assert.equal(offerPhase(offer({ first_day: "2026-11-28" }), TODAY, none), "a_venir");
  assert.equal(offerPhase(offer({ menu_item_id: DISH }), TODAY, none), "masquee");
  assert.equal(offerPhase(offer({ menu_item_id: DISH }), TODAY, new Set([DISH])), "en_cours");
  assert.equal(offerPhase(offer({ first_day: "2026-11-01", last_day: "2026-11-26" }), TODAY, none), "terminee");
  // Le dernier jour coché est passé, même si la date de fin est à venir : terminée.
  assert.equal(offerPhase(offer({ first_day: "2026-11-23", last_day: "2026-11-29", weekdays: [1] }), TODAY, none), "terminee");
});

test("les phrases : « Aujourd'hui seulement », « Chaque mardi, jusqu'au… », « Jusqu'au… inclus »", () => {
  assert.equal(whenShort(offer({ last_day: TODAY }), TODAY), "Aujourd'hui seulement");
  assert.equal(whenShort(offer(), TODAY), "Jusqu'au 5 décembre inclus");
  assert.equal(whenShort(offer({ first_day: "2026-12-01", last_day: "2026-12-01" }), "2026-12-01"), "Aujourd'hui seulement");
  assert.equal(whenShort(offer({ first_day: "2026-12-01", last_day: "2026-12-01" }), TODAY), "Le 1er décembre seulement");
  assert.equal(whenShort(offer({ weekdays: [2], last_day: "2026-12-13" }), TODAY), "Chaque mardi, jusqu'au 8 décembre");
  assert.equal(whenLong(offer()), "Du 27 novembre au 5 décembre inclus");
  assert.equal(whenLong(offer({ first_day: "2026-12-01", last_day: "2026-12-15", weekdays: [1, 2, 4] })), "Du 1er au 15 décembre inclus, chaque lundi, mardi et jeudi");
  assert.equal(whenLong(offer({ last_day: TODAY })), "Le 27 novembre");
  const p = publicOffer(offer({ conditions: "Avec un menu.", menu_item_id: DISH, published_by: "u" }), TODAY);
  assert.deepEqual(Object.keys(p).sort(), ["conditions", "id", "itemId", "long", "short", "title"]);
});

test("les mots du programme de fidélité sont refusés, même au pluriel ou déguisés", () => {
  for (const [text, word] of [["Double points ce soir", "point"], ["1 coupon par table", "coupon"], ["Un CADEAU au comptoir", "cadeau"], ["Des cadeaux", "cadeau"], ["Code promo MENU10", "code promo"], ["codes-promo", "code promo"], ["un code promotionnel", "code promo"], ["ca​deau", "cadeau"]]) {
    assert.equal(forbiddenWord(text), word, text);
  }
  for (const text of ["Frites offertes", "Pointe de moutarde offerte", "-20 % sur les menus", "Une promo le mardi"]) assert.equal(forbiddenWord(text), null, text);
});

const raw = (over: Record<string, unknown> = {}) => ({ title: "  Frites  offertes ", conditions: "", itemId: "", firstDay: "2026-11-28", lastDay: "2026-12-05", weekdays: [1, 2, 3, 4, 5, 6, 7], ...over });

test("la saisie : relue, nettoyée ; chaque refus dit quoi corriger", () => {
  assert.deepEqual(checkOfferFields(raw(), TODAY), { ok: true, value: { title: "Frites offertes", conditions: null, menu_item_id: null, first_day: "2026-11-28", last_day: "2026-12-05", weekdays: null } });
  const some = checkOfferFields(raw({ weekdays: [6, 2, 2, 9], conditions: "Avec <b>un menu</b>", itemId: DISH }), TODAY);
  assert.deepEqual(some.ok && [some.value.weekdays, some.value.conditions, some.value.menu_item_id], [[2, 6], "Avec b un menu /b", DISH]);
  const refusals: [Record<string, unknown>, RegExp][] = [
    [{ title: " " }, /titre/], [{ title: "x".repeat(81) }, /80/], [{ conditions: "x".repeat(281) }, /280/], [{ title: "Un cadeau" }, /cadeau/],
    [{ conditions: "Pas cumulable avec vos points" }, /point/], [{ itemId: "abc" }, /plat/], [{ firstDay: "" }, /premier/], [{ lastDay: "2026-11-27", firstDay: "2026-11-28" }, /après/],
    [{ firstDay: "2026-11-01", lastDay: "2026-11-26" }, /passé/], [{ lastDay: "2026-12-29" }, /31 jours/], [{ weekdays: [] }, /au moins un jour/],
    [{ firstDay: "2026-11-28", lastDay: "2026-11-29", weekdays: [1] }, /Aucun des jours/],
  ];
  for (const [over, message] of refusals) {
    const r = checkOfferFields(raw(over), TODAY);
    assert.equal(r.ok, false, JSON.stringify(over));
    if (!r.ok) assert.match(r.error, message);
  }
  // 31 jours exactement : permis.
  assert.equal(checkOfferFields(raw({ lastDay: "2026-12-28" }), TODAY).ok, true);
});
