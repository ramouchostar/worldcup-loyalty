import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_MAX_ESTABLISHMENTS,
  correctedFields,
  cuisineFromCategory,
  fromPrefill,
  sanitizeDraft,
  slugBase,
} from "./partner-draft";

const PREFILL = {
  placeId: "ChIJ_exemple_ixelles_01",
  name: "Krusty Smash Burger",
  address: "Chaussée d'Ixelles 1, 1050 Ixelles",
  sector: "Ixelles",
  phone: "02 000 00 01",
  website: "https://www.krustysmash.be/",
  mapsUrl: "https://maps.google.com/?cid=1",
  cuisine: ["Hamburgers"],
};

test("catégorie Google → type de cuisine", () => {
  assert.deepEqual(cuisineFromCategory("Restaurant de hamburgers"), ["Hamburgers"]);
  assert.deepEqual(cuisineFromCategory("Restaurant italien"), ["Italien"]);
  assert.deepEqual(cuisineFromCategory("Pizzeria"), ["Pizzeria"]);
  assert.deepEqual(cuisineFromCategory("Restaurant"), []);
  assert.deepEqual(cuisineFromCategory(null), []);
});

test("fiche Google sans correction : aucun champ corrigé, site lisible", () => {
  const e = fromPrefill(PREFILL);
  assert.equal(e.website, "krustysmash.be");
  assert.deepEqual(correctedFields(e), []);
});

test("les corrections du restaurateur sont relevées", () => {
  const e = { ...fromPrefill(PREFILL), name: "Krusty Smash Ixelles", phone: "0470 00 00 00" };
  assert.deepEqual(correctedFields(e), ["name", "phone"]);
});

test("saisie à la main : rien à comparer", () => {
  const d = sanitizeDraft({ establishments: [{ name: "Chez Paul", sector: "Namur" }] });
  assert.equal(d.establishments.length, 1);
  assert.equal(d.establishments[0].placeId, null);
  assert.deepEqual(correctedFields(d.establishments[0]), []);
});

test("brouillon revalidé : incomplets écartés, doublon de fiche retiré, site normalisé", () => {
  const e = fromPrefill(PREFILL);
  const d = sanitizeDraft({
    establishments: [e, { ...e }, { name: "X" }, { name: "Sans commune", sector: "" }],
  });
  assert.equal(d.establishments.length, 1);
  assert.equal(d.establishments[0].name, "Krusty Smash Burger");
});

test("plafond d'établissements", () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ name: `Resto ${i}`, sector: "Liège" }));
  assert.equal(sanitizeDraft({ establishments: many }).establishments.length, DRAFT_MAX_ESTABLISHMENTS);
});

test("brouillon illisible = vide, jamais d'exception", () => {
  assert.deepEqual(sanitizeDraft(null), { establishments: [] });
  assert.deepEqual(sanitizeDraft("texte"), { establishments: [] });
  assert.deepEqual(sanitizeDraft({ establishments: [null, 3] }), { establishments: [] });
});

test("identifiant : la commune départage deux établissements du même nom", () => {
  const a = fromPrefill(PREFILL);
  const b = { ...fromPrefill({ ...PREFILL, placeId: "ChIJ_exemple_uccle_002" }), sector: "Uccle" };
  assert.equal(slugBase(a, [a, b]), "Krusty Smash Burger Ixelles");
  assert.equal(slugBase(a, [a]), "Krusty Smash Burger");
});
