import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReviews, cleanPdfDescription, countsOf, hasEffect, matchLines, normalizeName, setConfirmed, setDescription, setUseDescription,
  toSaveRow, toggleAllergen, traceOfReviews, type CatalogItem, type PdfLine,
} from "./pdf";

const line = (name: string, description: string | null = null, allergens: PdfLine["allergens"] = null): PdfLine => ({ name, description, allergens });
const items: CatalogItem[] = [
  { id: "a1", name: "Cheese burger" }, { id: "a2", name: "Pizza Margherita" }, { id: "a3", name: "Mitraillette poulet" },
  { id: "a4", name: "Pizza Royale" }, { id: "a5", name: "Pizza Reine" },
];

test("normalizeName : accents, ligature, ponctuation et mots vides ne comptent pas", () => {
  assert.equal(normalizeName("Bœuf à la Crème !"), "boeuf creme");
  assert.equal(normalizeName("  CHEESE-burger "), "cheese burger");
});

test("rapprochement exact, quel que soit l'ordre des mots", () => {
  const r = matchLines([line("Margherita Pizza"), line("cheese BURGER")], items);
  assert.deepEqual(r.matches.map((m) => [m.articleId, m.how]).sort(), [["a1", "exact"], ["a2", "exact"]]);
  assert.equal(r.unmatchedLines.length, 0);
});

test("un nom proche mais pas sûr n'est PAS rapproché", () => {
  // « Pizza Reine » et « Pizza Royale » partagent « pizza » seulement : 1/3 < seuil.
  const r = matchLines([line("Pizza Quattro")], items);
  assert.equal(r.matches.length, 0);
  assert.equal(r.unmatchedLines.length, 1);
});

test("rapprochement proche quand un seul plat est candidat", () => {
  const r = matchLines([line("Mitraillette au poulet")], items);
  assert.deepEqual(r.matches.map((m) => [m.articleId, m.how]), [["a3", "exact"]]);
  const near = matchLines([line("Mitraillette poulet maison grillé")], items);
  assert.equal(near.matches.length, 0); // 2/5 : trop loin
});

test("deux lignes pour le même plat : aucune n'est rapprochée", () => {
  const r = matchLines([line("Cheese burger", "A"), line("Cheeseburger"), line("Burger cheese", "B")], items);
  assert.equal(r.matches.filter((m) => m.articleId === "a1").length, 0);
  assert.equal(r.unmatchedLines.length, 3);
  assert.ok(r.articlesWithout.includes("a1"));
});

test("deux plats identiques dans le catalogue : la ligne reste à part", () => {
  const dup: CatalogItem[] = [{ id: "x", name: "Frites" }, { id: "y", name: "Frites" }];
  const r = matchLines([line("Frites")], dup);
  assert.equal(r.matches.length, 0);
});

test("plats sans ligne et ligne vide", () => {
  const r = matchLines([line("Cheese burger"), line("   ")], items);
  assert.equal(r.matches.length, 1);
  assert.equal(r.articlesWithout.length, 4);
  assert.equal(r.unmatchedLines.length, 1);
});

test("description : balises retirées, vide = rien, trop longue = refusée", () => {
  assert.deepEqual(cleanPdfDescription("  <b>Bœuf</b>   grillé "), { text: "bBœuf/b grillé", tooLong: false });
  assert.deepEqual(cleanPdfDescription("   "), { text: null, tooLong: false });
  assert.deepEqual(cleanPdfDescription(null), { text: null, tooLong: false });
  assert.deepEqual(cleanPdfDescription("x".repeat(301)), { text: null, tooLong: true });
  assert.equal(cleanPdfDescription("x".repeat(300)).text?.length, 300);
});

test("jamais d'allergène sans PDF ni geste : non confirmé = null", () => {
  const [r] = buildReviews(matchLines([line("Cheese burger", "Bœuf, cheddar", ["gluten", "lait"])], items).matches);
  assert.deepEqual(r.allergens, ["gluten", "lait"]);
  assert.equal(r.allergensFromPdf, true);
  assert.equal(r.confirmed, false);
  assert.equal(toSaveRow(r).allergens, null); // proposé, pas encore un fait
  const ok = toSaveRow(setConfirmed(r, true));
  assert.deepEqual(ok.allergens, ["gluten", "lait"]);
});

test("un PDF sans allergène : liste vide, jamais « aucun » tant que non confirmé", () => {
  const [r] = buildReviews(matchLines([line("Cheese burger", "Bœuf")], items).matches);
  assert.equal(r.allergensFromPdf, false);
  assert.deepEqual(r.allergens, []);
  assert.equal(toSaveRow(r).allergens, null);
  assert.deepEqual(toSaveRow(setConfirmed(r, true)).allergens, []); // il dit lui-même « aucun »
});

test("changer la liste défait la confirmation", () => {
  const [r] = buildReviews(matchLines([line("Cheese burger", null, ["gluten"])], items).matches);
  const c = setConfirmed(r, true);
  const t = toggleAllergen(c, "lait");
  assert.equal(t.confirmed, false);
  assert.deepEqual(t.allergens, ["gluten", "lait"]);
  assert.deepEqual(toggleAllergen(t, "lait").allergens, ["gluten"]);
});

test("allergène inconnu ignoré, doublons retirés", () => {
  const [r] = buildReviews(matchLines([line("Cheese burger", null, ["gluten", "gluten", "pomme" as never])], items).matches);
  assert.deepEqual(r.allergens, ["gluten"]);
});

test("source de la description : pdf si inchangée, restaurateur si retouchée, rien si décochée", () => {
  const [r] = buildReviews(matchLines([line("Cheese burger", "Bœuf, cheddar")], items).matches);
  assert.equal(toSaveRow(r).descriptionSource, "pdf");
  assert.equal(toSaveRow(setDescription(r, "Mon burger")).descriptionSource, "restaurateur");
  const off = toSaveRow(setUseDescription(r, false));
  assert.equal(off.description, null);
  assert.equal(off.descriptionSource, null);
  const cleared = setDescription(r, "   ");
  assert.equal(cleared.description, null);
  assert.equal(cleared.useDescription, false);
});

test("sans description dans le PDF, la case ne peut pas être cochée", () => {
  const [r] = buildReviews(matchLines([line("Cheese burger")], items).matches);
  assert.equal(setUseDescription(r, true).useDescription, false);
});

test("hasEffect : rien à écrire = rien d'envoyé", () => {
  const [r] = buildReviews(matchLines([line("Cheese burger")], items).matches);
  assert.equal(hasEffect(toSaveRow(r)), false);
  assert.equal(hasEffect(toSaveRow(setConfirmed(r, true))), true);
});

test("trace : compte ce que le restaurateur a gardé, changé, confirmé", () => {
  const lines = [line("Cheese burger", "Bœuf", ["gluten"]), line("Pizza Margherita", "Tomate", ["gluten", "lait"]), line("Plat inconnu")];
  const res = matchLines(lines, items);
  let rv = buildReviews(res.matches);
  rv = rv.map((r) => (r.articleId === "a2" ? setDescription(toggleAllergen(r, "oeufs"), "Ma pizza") : setConfirmed(r, true)));
  const t = traceOfReviews(lines.length, countsOf(res), rv);
  assert.deepEqual(t, {
    linesRead: 3, matched: 2, matchedNear: 0, unmatched: 1, articlesWithout: 3,
    descProposed: 2, descKept: 1, descEdited: 1, allergensProposed: 2, allergensChanged: 1, allergensConfirmed: 1,
  });
});
