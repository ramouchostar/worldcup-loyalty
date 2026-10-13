import { test } from "node:test";
import assert from "node:assert/strict";
import { RETOUCH_ISSUE_TEXT, categoriesFor, judgeRetouchRound, nextDeliveryRound, retouchState, roundsLabel, sanitizeNotes, versionLabel } from "./mission-retouch";
import { MISSION_STATUSES } from "./mission-states";

const good = { category: "Lumière", text: "trop sombre, on ne voit pas la sauce", at: "" };

test("un tour valide : toutes les remarques classées et motivées, en un seul envoi", () => {
  const v = judgeRetouchRound([good, { category: "Rythme", text: "plan du burger trop court, garde-le 2 s de plus", at: "0:08" }], "video");
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.notes.map((n) => [n.category, n.at]), [["Lumière", null], ["Rythme", "0:08"]]);
});

test("un tour sans remarque est refusé", () => {
  assert.deepEqual(judgeRetouchRound([], "video"), { ok: false, reason: "empty", problems: [] });
});

test("« je n'aime pas » seul n'est pas une remarque, avec son indice", () => {
  const v = judgeRetouchRound([good, { category: "Lumière", text: "j'aime pas", at: "" }], "video");
  assert.deepEqual(v, { ok: false, reason: "notes", problems: [{ index: 1, issue: "vague" }] });
});

test("chaque remarque a besoin d'une catégorie, d'un texte, et d'un peu de précision", () => {
  const p = (n: { category: string | null; text: string; at: string }) => {
    const v = judgeRetouchRound([n], "video");
    return v.ok ? null : v.problems[0].issue;
  };
  assert.equal(p({ category: null, text: "trop sombre, on ne voit rien", at: "" }), "no_category");
  assert.equal(p({ category: "Lumière", text: "", at: "" }), "empty");
  assert.equal(p({ category: "Lumière", text: "trop sombre", at: "" }), "too_short");
});

test("les catégories dépendent du métier : « Prix » existe pour un menu, pas pour une vidéo", () => {
  assert.ok(categoriesFor("design").includes("Prix"));
  assert.ok(!categoriesFor("video").includes("Prix"));
  assert.equal(judgeRetouchRound([{ category: "Prix", text: "le prix du menu enfant est faux", at: "" }], "design").ok, true);
  assert.equal(judgeRetouchRound([{ category: "Prix", text: "le prix du menu enfant est faux", at: "" }], "video").ok, false);
});

test("l'horodatage est facultatif, mais s'il est écrit il est lisible", () => {
  const at = (x: string) => judgeRetouchRound([{ ...good, at: x }], "video").ok;
  assert.equal(at("0:08"), true);
  assert.equal(at("12:59"), true);
  assert.equal(at("8"), false);
  assert.equal(at("0:75"), false);
  assert.equal(at("à 8 secondes"), false);
});

test("vingt remarques au plus", () => {
  assert.equal(judgeRetouchRound(Array.from({ length: 20 }, () => good), "video").ok, true);
  assert.deepEqual(judgeRetouchRound(Array.from({ length: 21 }, () => good), "video"), { ok: false, reason: "too_many", problems: [] });
});

test("une entrée du réseau est ramenée, plafonnée, jamais crue", () => {
  assert.deepEqual(sanitizeNotes(null), []);
  assert.deepEqual(sanitizeNotes({ notes: "pas une liste" }), []);
  const n = sanitizeNotes({ notes: [{ category: " Lumière ", text: "  trop sombre, on ne voit pas la sauce ", at: " 0:08 " }, 5, null, { category: 3, text: 9 }] });
  assert.deepEqual(n[0], { category: "Lumière", text: "trop sombre, on ne voit pas la sauce", at: "0:08" });
  assert.deepEqual(n[1], { category: null, text: "", at: "" });
  assert.equal(sanitizeNotes({ notes: Array.from({ length: 80 }, () => ({})) }).length, 21);
  assert.equal(sanitizeNotes({ notes: [{ category: "Lumière", text: "x".repeat(5000) }] })[0].text.length, 1001);
});

test("chaque motif a une phrase", () => {
  for (const k of ["no_category", "empty", "vague", "too_short", "timecode_invalid", "text_too_long"] as const) assert.ok(RETOUCH_ISSUE_TEXT[k].length > 10, k);
});

test("on ne demande un tour que sur une livraison, et tant qu'il en reste", () => {
  assert.deepEqual(retouchState("livre", 0), { can: true, round: 1, left: 2 });
  assert.deepEqual(retouchState("livre", 1), { can: true, round: 2, left: 1 });
  assert.deepEqual(retouchState("livre", 2), { can: false, reason: "no_rounds_left" });
  for (const s of MISSION_STATUSES.filter((x) => x !== "livre")) assert.deepEqual(retouchState(s, 0), { can: false, reason: "not_delivered" }, s);
});

test("la livraison suivante : v1 depuis la production, v2 après un tour, v3 après deux", () => {
  assert.deepEqual(nextDeliveryRound("production", 0), { ok: true, round: 1 });
  assert.deepEqual(nextDeliveryRound("retouche", 1), { ok: true, round: 2 });
  assert.deepEqual(nextDeliveryRound("retouche", 2), { ok: true, round: 3 });
  assert.deepEqual(nextDeliveryRound("retouche", 0), { ok: false }); // une retouche sans tour compté n'existe pas
  assert.deepEqual(nextDeliveryRound("retouche", 3), { ok: false });
  assert.deepEqual(nextDeliveryRound("livre", 1), { ok: false });
  assert.deepEqual(nextDeliveryRound("date_bloquee", 0), { ok: false });
});

test("libellés", () => {
  assert.equal(versionLabel(2), "Version 2");
  assert.equal(roundsLabel(2), "Il te reste 2 tours de retours");
  assert.equal(roundsLabel(1), "Il te reste 1 tour de retours");
  assert.equal(roundsLabel(0), "Aucun tour de retours restant");
});
