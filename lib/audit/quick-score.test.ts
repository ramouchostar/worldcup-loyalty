import { test } from "node:test";
import assert from "node:assert/strict";
import { median, normalizePhone, offsetM, quickCompetitorScore, quickGlobal, quickReviewScore, rankAmong, scoreBand, verdictOf } from "./quick-score";

test("avis : la note pèse 70 %, la part d'avis récents à 4★+ 30 %", () => {
  assert.equal(quickReviewScore(null, [5, 5]), null);
  assert.equal(quickReviewScore(5, []), 100);
  assert.equal(quickReviewScore(3, []), 0);
  // 4,0★ → 0,5 ; 3 avis sur 5 à 4★+ → 0,6 → 0,35 + 0,18 = 53
  assert.equal(quickReviewScore(4, [5, 4, 1, 2, 5]), 53);
  // un avis sans note n'entre pas dans la part
  assert.equal(quickReviewScore(4, [5, null]), 65);
});

test("concurrents : rang de la note et volume face à la médiane", () => {
  assert.equal(quickCompetitorScore({ rating: 4.2, reviewsCount: 100 }, []), null);
  assert.equal(quickCompetitorScore({ rating: null, reviewsCount: 100 }, [{ rating: 4, reviewsCount: 10 }]), null);
  // meilleur que tous, plus d'avis que la médiane → 100
  assert.equal(quickCompetitorScore({ rating: 4.8, reviewsCount: 400 }, [{ rating: 4.1, reviewsCount: 200 }, { rating: 3.9, reviewsCount: 100 }]), 100);
  // dernier, moitié d'avis de la médiane → 0 + 0,5 × 0,4 = 20
  assert.equal(quickCompetitorScore({ rating: 3.5, reviewsCount: 50 }, [{ rating: 4.1, reviewsCount: 100 }, { rating: 4.4, reviewsCount: 100 }]), 20);
});

test("rang parmi les voisins et noms de ceux qui passent devant", () => {
  const r = rankAmong({ name: "Moi", rating: 4.1, reviewsCount: 312 }, [
    { name: "Pita Street", rating: 4.6, reviewsCount: 500 },
    { name: "Le Coin Grec", rating: 4.4, reviewsCount: 90 },
    { name: "Snack", rating: 3.9, reviewsCount: 40 },
    { name: "Sans note", rating: null, reviewsCount: null },
  ]);
  assert.deepEqual(r, { rank: 3, of: 4, ahead: ["Pita Street", "Le Coin Grec"] });
});

test("note globale : un volet non lu sort de la moyenne", () => {
  assert.equal(quickGlobal({}), null);
  assert.equal(quickGlobal({ fiche: 50, avis: 70, concurrents: null, site: null }), 60);
  assert.equal(quickGlobal({ fiche: 40, avis: 60, concurrents: 80, site: 20 }), 50);
});

test("verdict et tranche : jamais la note exacte vers la mesure d'audience", () => {
  assert.equal(verdictOf(null), null);
  assert.equal(verdictOf(80), "bon");
  assert.equal(verdictOf(50), "a_renforcer");
  assert.equal(verdictOf(49), "fragile");
  assert.equal(scoreBand(74), "50_74");
  assert.equal(scoreBand(null), "inconnu");
});

test("médiane et décalage en mètres", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  const o = offsetM({ lat: 50.8, lng: 4.35 }, { lat: 50.8009, lng: 4.35 });
  assert.equal(o.dx, 0);
  assert.ok(Math.abs(o.dy - 100) <= 1);
});

test("numéro de mobile : belge sans indicatif, international avec", () => {
  assert.equal(normalizePhone("0470 12 34 56"), "+32470123456");
  assert.equal(normalizePhone("470/12.34.56"), "+32470123456");
  assert.equal(normalizePhone("+32 470 12 34 56"), "+32470123456");
  assert.equal(normalizePhone("0032470123456"), "+32470123456");
  assert.equal(normalizePhone("+33 6 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("02 123 45 67"), null); // fixe belge : pas de WhatsApp
  assert.equal(normalizePhone("abc"), null);
  assert.equal(normalizePhone(""), null);
});
