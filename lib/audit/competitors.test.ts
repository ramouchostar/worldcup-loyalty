import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceM, gapsCovered, gridPoints, isKnownBrand, mainRival, nearbyCompetitors, neighborsScore, positionSignal, searchKeyword, volumeSignal, type Competitor } from "./competitors";
import type { MapsResult } from "./dataforseo";

const item = (over: Partial<MapsResult>): MapsResult => ({
  rank: 1, cid: "x", title: "X", category: null, rating: 4.5, reviews: 100, address: null, latitude: 50.85, longitude: 4.46,
  totalPhotos: 50, isClaimed: true, hasWebsite: true, hasOrderButton: false, priceLevel: null, ...over,
});

test("mot-clé de recherche tiré de la catégorie", () => {
  assert.equal(searchKeyword("Restaurant de hamburgers", null), "burger");
  assert.equal(searchKeyword("Restauration rapide", ["Restaurant de poulet"]), "fast food");
  assert.equal(searchKeyword("Restaurant", ["Pizzeria"]), "pizza");
  assert.equal(searchKeyword(null, null, "Chez Karim Grill"), "grill");
  assert.equal(searchKeyword("Restaurant", null), "restaurant");
});

test("grille 3 × 3 : points à 700 m, le centre sur le restaurant", () => {
  const pts = gridPoints(50.85, 4.46);
  assert.equal(pts.length, 9);
  const c = pts.find((p) => p.row === 0 && p.col === 0)!;
  assert.deepEqual([c.lat, c.lng], [50.85, 4.46]);
  const east = pts.find((p) => p.row === 0 && p.col === 1)!;
  assert.ok(Math.abs(distanceM({ lat: c.lat, lng: c.lng }, east) - 700) < 5);
});

test("concurrents : soi-même exclu, doublons et lointains écartés", () => {
  const self = { cid: "moi", lat: 50.85, lng: 4.46 };
  const out = nearbyCompetitors(
    [item({ cid: "moi" }), item({ cid: "a" }), item({ cid: "a" }), item({ cid: "loin", latitude: 50.9 })],
    self,
  );
  assert.deepEqual(out.map((c) => c.cid), ["a"]);
});

test("un doublon de sa propre fiche n'est pas un concurrent", () => {
  const self = { cid: "moi", lat: 50.85, lng: 4.46, title: "Belchicken Kraainem | Taste Matters" };
  const out = nearbyCompetitors([item({ cid: "tm", title: "Taste matters", reviews: null }), item({ cid: "q", title: "Quick Kraainem", reviews: 2500 })], self);
  assert.deepEqual(out.map((c) => c.cid), ["q"]);
});

test("concurrent principal : une enseigne connue proche l'emporte (Quick face à Belchicken)", () => {
  const comp = (title: string, reviews: number, distance: number) => ({ ...item({ title, reviews, cid: title }), distance }) as Competitor;
  const rival = mainRival([comp("Snack du coin", 900, 300), comp("Quick Kraainem", 2500, 350), comp("Grill lointain", 5000, 1900)]);
  assert.equal(rival?.title, "Quick Kraainem");
  assert.ok(isKnownBrand("QUICK Woluwe"));
  assert.ok(!isKnownBrand("Quickly Sushi")); // mot entier seulement
});

test("score face aux voisins et signaux", () => {
  const comps = [4.2, 4.4, 4.6].map((r, i) => ({ ...item({ rating: r, reviews: 200, totalPhotos: 40, cid: String(i) }), distance: 500 })) as Competitor[];
  const grid = [1, 1, 2, 3, 5, 8, null, null, 15].map((rank, i) => ({ row: Math.floor(i / 3) - 1, col: (i % 3) - 1, rank }));
  const s = neighborsScore({ rating: 4.7, reviews: 526, photos: 65 }, comps, grid);
  assert.equal(s.medianRating, 4.4);
  assert.equal(s.parts.note, 24); // (4,7 − 4,4 + 0,5) × 30
  assert.equal(s.parts.volume, 25);
  assert.equal(s.parts.photos, 15);
  assert.ok(s.score > 70 && s.score <= 100);
  assert.equal(positionSignal(4.7, 4.4), "devant");
  assert.equal(positionSignal(4.3, 4.4), "au_niveau");
  assert.equal(volumeSignal(50, 200), "faible");
});

test("manques comblés par la majorité des voisins", () => {
  const comps = [true, true, false].map((o, i) => ({ ...item({ hasOrderButton: o, hasWebsite: false, totalPhotos: 200, cid: String(i) }), distance: 100 })) as Competitor[];
  assert.deepEqual(gapsCovered(comps, 40).sort(), ["pas_de_lien_commande", "photos_peu_nombreuses"]);
});
