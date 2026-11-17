import assert from "node:assert/strict";
import { test } from "node:test";
import { applyExtras, buildHints, cleanNames, cleanSections, countHints, extrasSignature, menuKind } from "./menu-structure";
import type { PackGroup } from "./packs";

test("cleanNames : texte seul, sans doublon (accents et casse ne comptent pas), bornes respectées", () => {
  assert.deepEqual(cleanNames(["  Samouraï ", "samourai", "<b>Blanche</b>", 12, "", "Ketchup"]), ["Samouraï", "bBlanche/b", "Ketchup"]);
  assert.deepEqual(cleanNames("pas une liste"), []);
  assert.equal(cleanNames(Array.from({ length: 80 }, (_, i) => `Sauce ${i}`)).length, 40);
  assert.equal(cleanNames(["x".repeat(200)])[0].length, 60);
});

test("cleanSections : une rubrique sans sauce ni accompagnement n'apprend rien et est écartée", () => {
  const out = cleanSections([
    { category: "Burgers", sauces: ["Ketchup", "Mayo"], oneOf: [] },
    { category: "Pizzas", sauces: [], oneOf: [] },
    { category: null, sauces: [], oneOf: ["Frites", "Riz"] },
    "n'importe quoi",
    { category: 12, sauces: ["Ail"], oneOf: null },
  ]);
  assert.deepEqual(out, [
    { category: "Burgers", sauces: ["Ketchup", "Mayo"], oneOf: [] },
    { category: null, sauces: [], oneOf: ["Frites", "Riz"] },
    { category: null, sauces: ["Ail"], oneOf: [] },
  ]);
});

const sections = cleanSections([
  { category: "Burgers", sauces: ["Ketchup", "Mayo"], oneOf: [] },
  { category: "Menus kebab", sauces: ["Blanche", "Harissa"], oneOf: ["Frites", "Riz"] },
  { category: null, sauces: ["Algérienne"], oneOf: [] },
]);

test("buildHints : la rubrique du plat prime, à défaut la phrase qui vaut pour tout le menu", () => {
  const h = buildHints([
    { articleId: "a", category: "Burgers" }, { articleId: "b", category: "MENUS KEBAB" },
    { articleId: "c", category: "Pizzas" }, { articleId: "d", category: null },
  ], sections);
  assert.deepEqual(h.categoryOf, { a: "Burgers", b: "MENUS KEBAB", c: "Pizzas" });
  assert.deepEqual(h.extrasOf.a, { sauces: ["Ketchup", "Mayo"], oneOf: [] });
  assert.deepEqual(h.extrasOf.b, { sauces: ["Blanche", "Harissa"], oneOf: ["Frites", "Riz"] });
  assert.deepEqual(h.extrasOf.c, { sauces: ["Algérienne"], oneOf: [] }); // Pizzas n'a pas de rubrique : le menu entier parle
  assert.deepEqual(h.extrasOf.d, { sauces: ["Algérienne"], oneOf: [] });
});

test("buildHints : un menu muet ne propose rien", () => {
  const h = buildHints([{ articleId: "a", category: "Burgers" }], []);
  assert.deepEqual(h, { categoryOf: { a: "Burgers" }, extrasOf: {} });
});

test("extrasSignature : mêmes sauces et mêmes accompagnements, quel que soit l'ordre ou l'écriture", () => {
  const a = extrasSignature({ sauces: ["Mayo", "Ketchup"], oneOf: ["Frites", "Riz"] });
  assert.equal(a, extrasSignature({ sauces: ["ketchup", "MAYO"], oneOf: ["riz", "frites"] }));
  assert.notEqual(a, extrasSignature({ sauces: ["Mayo"], oneOf: ["Frites", "Riz"] }));
  assert.equal(extrasSignature(undefined), "");
});

test("countHints : compte les rubriques et les listes DISTINCTES", () => {
  const h = buildHints([{ articleId: "a", category: "Burgers" }, { articleId: "b", category: "Burgers" }, { articleId: "c", category: "Menus kebab" }], sections);
  assert.deepEqual(countHints(h), { categories: 2, sauceLists: 2, sideLists: 1 });
});

const SNACK_SAUCES: PackGroup = { title: "Sauces", kind: "inclus", min: 1, max: 2, choices: [{ name: "Blanche" }, { name: "Samouraï" }] };
const EXTRA: PackGroup = { title: "Suppléments", kind: "extra", min: 0, max: 4, choices: [{ name: "Feta" }] };

test("applyExtras : les sauces du menu REMPLACENT nos idées, la règle du groupe reste", () => {
  const out = applyExtras([SNACK_SAUCES, EXTRA], { sauces: ["Ketchup", "Mayo"], oneOf: [] });
  assert.deepEqual(out[0].choices.map((c) => c.name), ["Ketchup", "Mayo"]);
  assert.deepEqual([out[0].min, out[0].max, out[0].guess], [1, 2, false]);
  assert.equal(out[1].title, "Suppléments");
  assert.deepEqual(SNACK_SAUCES.choices.map((c) => c.name), ["Blanche", "Samouraï"]); // l'original n'est pas touché
});

test("applyExtras : sans liste de sauces dans le lot, une liste gratuite « à confirmer » est ajoutée", () => {
  const out = applyExtras([EXTRA], { sauces: ["Ketchup"], oneOf: [] });
  const added = out.find((g) => g.title === "Sauces")!;
  assert.deepEqual([added.kind, added.guess, added.min, added.max], ["inclus", true, 0, 1]);
});

test("applyExtras : « frites ou riz » = une liste gratuite où le client en choisit un, obligatoire", () => {
  const out = applyExtras([SNACK_SAUCES, EXTRA], { sauces: [], oneOf: ["Frites", "Riz"] });
  assert.deepEqual(out.map((g) => g.title), ["Sauces", "Accompagnement", "Suppléments"]);
  const acc = out[1];
  assert.deepEqual([acc.kind, acc.min, acc.max, acc.choices.map((c) => c.name)], ["inclus", 1, 1, ["Frites", "Riz"]]);
});

test("applyExtras : un seul accompagnement n'est pas un choix ; jamais de prix ni de choix coché d'office", () => {
  assert.equal(applyExtras([EXTRA], { sauces: [], oneOf: ["Frites"] }).length, 1);
  const out = applyExtras([], { sauces: ["Ail", "Mayo"], oneOf: ["Frites", "Riz"] });
  for (const g of out) for (const c of g.choices) assert.equal(c.isDefault, undefined);
  assert.deepEqual(applyExtras([EXTRA], undefined), [EXTRA]); // un menu muet ne change rien
});

test("menuKind : « Menu kebab » et « Menu durum » vont ensemble, « Menu burger » à part", () => {
  const k = (name: string, category?: string) => menuKind({ name, category });
  assert.equal(k("Menu kebab poulet").key, k("Menu durum kefta").key);
  assert.equal(k("Menu kebab poulet").label, "Menus kebabs et durums");
  assert.notEqual(k("Menu burger").key, k("Menu kebab").key);
  assert.equal(k("Menu burger").label, "Menus burgers");
});

test("menuKind : le mot « Menu » en fin de nom et les quantités ne trompent pas", () => {
  assert.equal(menuKind({ name: "12 Wings Menu" }).key, menuKind({ name: "8 Hot Wings Menu" }).key);
  assert.equal(menuKind({ name: "Smoky XL Menu", category: "Burgers" }).key, "menu:burger"); // « smoky » ne dit rien : la catégorie « Burgers » parle
});

test("menuKind : une catégorie qui dit seulement « Menus » ne dit rien ; sans rien, « Autres menus »", () => {
  assert.equal(menuKind({ name: "Chef's Choice", category: "Menus" }).key, "menu:divers");
  assert.equal(menuKind({ name: "Chef's Choice" }).label, "Autres menus");
});
