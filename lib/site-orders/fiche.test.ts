import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlaceOrderingInfo } from "../audit/places";
import { VIEW_REASON_PREFIX, closedNote, ficheView, ratingLabel, viewReason, type FicheRead } from "./fiche";
import { NO_SETTINGS } from "./page-settings";

const info = (extra: Partial<PlaceOrderingInfo> = {}): PlaceOrderingInfo => ({
  rating: 3.5, reviewsCount: 156, businessStatus: "OPERATIONAL", currentOpeningHours: null,
  regularOpeningHours: { periods: [{ open: { day: 0 } }] }, attributions: [], ...extra,
});
const NOW = new Date("2026-11-26T11:00:00Z");

test("fiche lue : état, note et nombre d'avis", () => {
  const view = ficheView({ ok: true, info: info() }, NOW);
  assert.equal(view.openness.state, "ouvert");
  assert.deepEqual(view.rating, { value: 3.5, count: 156 });
  assert.equal(ratingLabel(view.rating!), "3,5 sur 5, 156 avis Google");
  assert.equal(ratingLabel({ value: 4, count: 1 }), "4,0 sur 5, 1 avis Google");
});

test("une note absente ou sans avis reste absente : jamais un zéro inventé", () => {
  for (const extra of [{ rating: null }, { reviewsCount: null }, { reviewsCount: 0 }, { rating: 0 }]) {
    assert.equal(ficheView({ ok: true, info: info(extra) }, NOW).rating, null, JSON.stringify(extra));
  }
});

test("les mentions de fournisseurs tiers suivent le résultat ; un lien douteux est écarté, le nom reste", () => {
  const view = ficheView({ ok: true, info: info({ attributions: [{ provider: "Fournisseur A", providerUri: "https://a.example" }, { provider: "B", providerUri: "javascript:alert(1)" }, { provider: " " }] }) }, NOW);
  assert.deepEqual(view.attributions, [{ provider: "Fournisseur A", url: "https://a.example" }, { provider: "B", url: null }]);
});

test("fiche non lue : horaires inconnus, aucune note, et le compteur dit pourquoi", () => {
  const read: FicheRead = { ok: false, cause: "places_absent" };
  const view = ficheView(read, NOW);
  assert.deepEqual(view, { readAt: NOW.toISOString(), openness: { state: "inconnu" }, origin: "aucune", hoursFromGoogle: false, rating: null, attributions: [] });
  assert.equal(viewReason(read, view), "fiche_vue_inconnu:places_absent");
});

test("les compteurs de visites ont un préfixe commun et tiennent dans la colonne (60 lettres)", () => {
  const reads: FicheRead[] = [
    { ok: true, info: info() }, { ok: true, info: info({ businessStatus: "CLOSED_TEMPORARILY" }) },
    { ok: true, info: info({ regularOpeningHours: null }) }, { ok: false, cause: "pas_de_fiche" }, { ok: false, cause: "lecture_impossible" },
  ];
  const reasons = reads.map((r) => viewReason(r, ficheView(r, NOW)));
  assert.deepEqual(reasons, ["fiche_vue_ouvert:google", "fiche_vue_ferme:google", "fiche_vue_inconnu:sans_horaires", "fiche_vue_inconnu:pas_de_fiche", "fiche_vue_inconnu:lecture_impossible"]);
  for (const r of reasons) assert.ok(r.startsWith(VIEW_REASON_PREFIX) && r.length <= 60);
});

const WEEK = Array.from({ length: 7 }, () => [{ open: "11:00", close: "22:00" }]);

test("avec ses horaires, la note qui échoue ne change rien, et le compteur dit la source", () => {
  const mine = { ...NO_SETTINGS, source: "manual" as const, weekly: WEEK };
  for (const read of [null, { ok: false, cause: "lecture_impossible" } as FicheRead]) {
    const view = ficheView(read, NOW, mine);
    assert.deepEqual([view.openness.state, view.origin, view.rating, view.attributions], ["ouvert", "saisi", null, []]);
    assert.equal(viewReason(read, view), "fiche_vue_ouvert:saisi");
  }
  const rated = ficheView({ ok: true, info: info({ regularOpeningHours: null }) }, NOW, mine);
  assert.equal(rated.hoursFromGoogle, false); // la mention n'accompagne que la note
  assert.ok(rated.rating);
  const fallback = ficheView({ ok: false, cause: "lecture_impossible" }, NOW, { ...NO_SETTINGS, weekly: WEEK });
  assert.equal(viewReason({ ok: false, cause: "lecture_impossible" }, fallback), "fiche_vue_ouvert:repli");
  const closed = ficheView(null, NOW, { ...mine, closedToday: "2026-11-26" });
  assert.equal(viewReason(null, closed), "fiche_vue_ferme:fermeture");
});

test("sous le panier, on dit d'où vient « fermé »", () => {
  assert.match(closedNote("google"), /fiche Google/);
  assert.equal(closedNote("saisi"), "Horaires donnés par le restaurant.");
  assert.equal(closedNote("repli"), "Horaires donnés par le restaurant.");
  assert.equal(closedNote("fermeture"), "Fermeture annoncée par le restaurant.");
});
