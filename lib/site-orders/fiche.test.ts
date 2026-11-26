import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlaceOrderingInfo } from "../audit/places";
import { VIEW_REASON_PREFIX, ficheView, ratingLabel, viewReason, type FicheRead } from "./fiche";

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
  assert.deepEqual(view, { readAt: NOW.toISOString(), openness: { state: "inconnu" }, rating: null, attributions: [] });
  assert.equal(viewReason(read, view), "fiche_vue_inconnu:places_absent");
});

test("les compteurs de visites ont un préfixe commun et tiennent dans la colonne (60 lettres)", () => {
  const reads: FicheRead[] = [
    { ok: true, info: info() }, { ok: true, info: info({ businessStatus: "CLOSED_TEMPORARILY" }) },
    { ok: true, info: info({ regularOpeningHours: null }) }, { ok: false, cause: "pas_de_fiche" }, { ok: false, cause: "lecture_impossible" },
  ];
  const reasons = reads.map((r) => viewReason(r, ficheView(r, NOW)));
  assert.deepEqual(reasons, ["fiche_vue_ouvert", "fiche_vue_ferme", "fiche_vue_inconnu:sans_horaires", "fiche_vue_inconnu:pas_de_fiche", "fiche_vue_inconnu:lecture_impossible"]);
  for (const r of reasons) assert.ok(r.startsWith(VIEW_REASON_PREFIX) && r.length <= 60);
});
