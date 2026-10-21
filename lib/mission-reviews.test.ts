import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMENTS_SHOWN, MIN_REVIEWS_FOR_AVERAGE, REVIEW_ISSUE_TEXT, canReview, judgeReview, sanitizeReview, summarize, validateReview } from "./mission-reviews";

const codes = (raw: unknown) => validateReview(sanitizeReview(raw)).issues.map((i) => i.code);

test("on ne note qu'une mission validée ou versée", () => {
  for (const s of ["valide", "verse"]) assert.equal(canReview(s), true, s);
  for (const s of ["brief", "envoye", "devis", "accepte", "production", "livre", "retouche", "litige", "annule", "suspendu"]) assert.equal(canReview(s), false, s);
});

test("un seul avis par mission et par sens", () => {
  assert.equal(judgeReview("verse", false), "ok");
  assert.equal(judgeReview("verse", true), "already_reviewed");
  assert.equal(judgeReview("livre", false), "not_finished");
});

test("la note est un entier de 1 à 5", () => {
  assert.deepEqual(codes({ rating: 5 }), []);
  assert.deepEqual(codes({ rating: 3, comment: "Bien." }), []);
  for (const bad of [0, 6, 3.5, -1, "4", null, undefined, Number.NaN]) assert.deepEqual(codes({ rating: bad }), ["rating"], String(bad));
  assert.deepEqual(codes(null), ["rating"]);
});

test("une note de 1 ou 2 demande une explication ; 3 et plus non", () => {
  assert.deepEqual(codes({ rating: 1 }), ["comment_needed"]);
  assert.deepEqual(codes({ rating: 2, comment: "trop court" }), ["comment_needed"]);
  assert.deepEqual(codes({ rating: 2, comment: "Livré avec trois jours de retard." }), []);
  assert.deepEqual(codes({ rating: 3 }), []);
});

test("le commentaire est limité et sans coordonnées", () => {
  assert.deepEqual(codes({ rating: 5, comment: "a".repeat(601) }), ["comment_too_long"]);
  assert.deepEqual(codes({ rating: 5, comment: "a".repeat(600) }), []);
  assert.deepEqual(codes({ rating: 5, comment: "Super, écris-moi à moi@exemple.be" }), ["contact_in_comment"]);
  assert.deepEqual(codes({ rating: 5, comment: "Appelle-le au 0470 12 34 56" }), ["contact_in_comment"]);
});

test("chaque refus a une phrase lisible", () => {
  for (const t of Object.values(REVIEW_ISSUE_TEXT)) assert.ok(t.length > 10);
});

test("un dépassement du commentaire reste visible pour que la validation le refuse (aucune coupe silencieuse)", () => {
  assert.equal(validateReview(sanitizeReview({ rating: 5, comment: "a".repeat(2000) })).ok, false);
});

test("la moyenne ne s'affiche qu'à partir de trois avis", () => {
  const r = (rating: number, at: string, comment = "") => ({ rating, comment, at });
  const none = summarize([]);
  assert.deepEqual(none, { count: 0, average: null, shownAverage: false, comments: [] });
  const two = summarize([r(5, "2026-10-01"), r(4, "2026-10-02")]);
  assert.equal(two.shownAverage, false);
  assert.equal(two.average, 4.5);
  const three = summarize([r(5, "2026-10-01"), r(4, "2026-10-02"), r(4, "2026-10-03")]);
  assert.equal(three.count, MIN_REVIEWS_FOR_AVERAGE);
  assert.equal(three.shownAverage, true);
  assert.equal(three.average, 4.3);
});

test("les derniers commentaires seulement, les notes sans commentaire écartées", () => {
  const list = Array.from({ length: 6 }, (_, i) => ({ rating: 5, comment: i === 2 ? "" : `Avis ${i}`, at: `2026-10-0${i + 1}` }));
  const s = summarize(list);
  assert.equal(s.comments.length, COMMENTS_SHOWN);
  assert.deepEqual(s.comments.map((c) => c.comment), ["Avis 5", "Avis 4", "Avis 3"]);
  assert.ok(!summarize(list.slice(0, 3)).comments.some((c) => c.comment === ""));
});
