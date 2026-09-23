import { test } from "node:test";
import assert from "node:assert/strict";
import { findBreakpoint, monthlySeries, ownerResponses, trendOf } from "./reviews-analysis";
import { scoreFiche } from "./fiche-score";
import { toStoredReview, type BusinessInfo, type StoredReview } from "./dataforseo";

const NOW = new Date("2026-09-23T12:00:00Z");
const review = (date: string, rating: number, answered = false): StoredReview => ({
  rating, text: null, date: new Date(date).toISOString(), ownerAnswer: answered ? "Merci" : null,
  ownerAnswerDate: answered ? new Date(Date.parse(date) + 2 * 864e5).toISOString() : null,
});
// n avis par mois, à la note donnée, de `from` (inclus) sur `months` mois.
function series(from: string, months: number, perMonth: number, rating: number): StoredReview[] {
  const out: StoredReview[] = [];
  const d0 = new Date(from + "-10T12:00:00Z");
  for (let m = 0; m < months; m++) {
    const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + m, 10));
    for (let i = 0; i < perMonth; i++) out.push(review(d.toISOString(), rating));
  }
  return out;
}

test("courbe mensuelle et moyenne glissante sur 3 mois", () => {
  const pts = monthlySeries([...series("2026-01", 1, 2, 5), ...series("2026-02", 1, 2, 3), ...series("2026-03", 1, 4, 4)]);
  assert.deepEqual(pts.map((p) => p.month), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(pts[1].avg, 3);
  assert.equal(pts[2].rolling3, 4); // (10 + 6 + 16) / 8
});

test("bascule nette : trouvée au bon mois", () => {
  const r = [...series("2025-01", 14, 3, 5), ...series("2026-03", 7, 4, 3)];
  const bp = findBreakpoint(r);
  assert.equal(bp?.month, "2026-03");
  assert.equal(bp?.before, 5);
  assert.equal(bp?.after, 3);
});

test("pas de bascule inventée : note stable ou trop peu d'avis", () => {
  assert.equal(findBreakpoint(series("2025-01", 20, 4, 4)), null);
  assert.equal(findBreakpoint([...series("2026-01", 1, 10, 5), ...series("2026-02", 1, 10, 2)]), null); // < 20 de chaque côté
});

test("tendance des 90 derniers jours face à l'année d'avant", () => {
  const r = [...series("2025-07", 9, 3, 5), ...series("2026-07", 3, 3, 3)];
  assert.equal(trendOf(r, NOW), "baisse");
  assert.equal(trendOf(series("2025-07", 15, 3, 4), NOW), "stable");
  assert.equal(trendOf(series("2026-08", 1, 2, 4), NOW), null); // pas assez de recul
});

test("réponses du propriétaire : part, niveau, délai, sur 12 mois seulement", () => {
  const r = [review("2026-05-01", 5, true), review("2026-06-01", 1, true), review("2026-07-01", 2), review("2026-08-01", 4), review("2024-01-01", 1)];
  const o = ownerResponses(r, NOW);
  assert.equal(o.share, 0.5);
  assert.equal(o.level, "moyen");
  assert.equal(o.medianDelayDays, 2);
  assert.equal(o.negativeShare, 0.5);
});

test("un avis stocké ne garde rien de son auteur", () => {
  const s = toStoredReview({ rating: { value: 4 }, review_text: "Bon", timestamp: "2026-03-14 18:22:10 +00:00", owner_answer: null, profile_name: "Jean Dupont", profile_url: "https://x" } as never);
  assert.deepEqual(Object.keys(s).sort(), ["date", "ownerAnswer", "ownerAnswerDate", "rating", "text"]);
  assert.equal(s.date, "2026-03-14T18:22:10.000Z");
});

const INFO: BusinessInfo = {
  title: "Krusty Smash Burgers", description: null, category: "Restaurant de hamburgers", additional_categories: ["Restaurant"],
  cid: "1", place_id: "p", address: "Rue X 1, 1050 Ixelles", address_info: { postal_code: "1050" }, phone: "0497",
  url: "https://www.krusty-smash-burger.be/", domain: "krusty-smash-burger.be", total_photos: 320, is_claimed: true,
  price_level: "€€", rating: { value: 4.7, votes_count: 524 }, rating_distribution: null, place_topics: null,
  attributes: null, work_time: { work_hours: { timetable: { monday: [] } } }, local_business_links: [{ type: "menu", url: "x" }],
  latitude: null, longitude: null, last_updated_time: null,
};

test("grille de la fiche : non vérifié hors dénominateur, manques remontés au moteur", () => {
  const s = scoreFiche(INFO, { rating: 4.7, reviewsCount: 524, competitorMedianReviews: null, responseShare: null, medianDelayDays: null });
  assert.ok(s.score != null && s.score > 0 && s.score <= 100);
  assert.ok(s.verified < s.total);
  assert.ok(s.gaps.includes("pas_de_lien_commande"));
  assert.ok(s.gaps.includes("pas_de_description"));
  assert.ok(!s.gaps.includes("pas_de_menu"));
  assert.ok(!s.gaps.includes("horaires_exceptionnels")); // non vérifié ≠ manquant
});

test("un site Facebook compte à moitié et devient le manque « site_facebook »", () => {
  const s = scoreFiche({ ...INFO, url: "https://facebook.com/krusty" }, { rating: null, reviewsCount: null, competitorMedianReviews: null, responseShare: null, medianDelayDays: null });
  assert.equal(s.criteria.find((c) => c.key === "site")?.status, "partiel");
  assert.ok(s.gaps.includes("site_facebook"));
});
