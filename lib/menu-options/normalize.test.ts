import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanOptionName, normalizeMax, optionKey, stripSansPrefix } from "./normalize";
import { canonicalRole } from "./roles";

test("noms : point final, espaces et point précédé d'une espace", () => {
  assert.equal(cleanOptionName("Capri Sun."), "Capri Sun");
  assert.equal(cleanOptionName("  Pepsi   Max. "), "Pepsi Max");
  assert.equal(cleanOptionName("SANS OIGNONS ."), "Sans oignons");
  assert.equal(cleanOptionName("4pc. Chili Cheese."), "4pc. Chili Cheese");
  assert.equal(cleanOptionName(""), "");
});

test("noms : tout en majuscules devient une phrase, un sigle court reste", () => {
  assert.equal(cleanOptionName("SOJA SUCREE"), "Soja sucree");
  assert.equal(cleanOptionName("EXTRA SAUCE SPICY"), "Extra sauce spicy");
  assert.equal(cleanOptionName("BBQ"), "BBQ");
  assert.equal(cleanOptionName("Korean BBQ XXL"), "Korean BBQ XXL");
});

test("« sans » est porté par le type de groupe, pas par le nom", () => {
  assert.deepEqual(stripSansPrefix("SANS AVOCAT"), { name: "Avocat", wasSans: true });
  assert.deepEqual(stripSansPrefix("Sans oignons frits ."), { name: "Oignons frits", wasSans: true });
  assert.deepEqual(stripSansPrefix("Without onions"), { name: "Onions", wasSans: true });
  assert.deepEqual(stripSansPrefix("Samourai"), { name: "Samourai", wasSans: false });
  // un mot qui commence par « sans » sans espace derrière n'est pas un préfixe
  assert.equal(stripSansPrefix("Sansevieria").wasSans, false);
});

test("clé d'option : deux écritures d'une même sauce se reconnaissent", () => {
  assert.equal(optionKey("Samouraï"), optionKey("samourai."));
  assert.equal(optionKey("  Sauce   BLANCHE "), "sauce blanche");
  assert.notEqual(optionKey("Sweet Chili"), optionKey("Sweet Chili XXL"));
  assert.equal(optionKey("Curry ketchup"), "curry ketchup");
});

test("maximum : 99 des plateformes veut dire « sans limite »", () => {
  assert.equal(normalizeMax(99), null);
  assert.equal(normalizeMax(120), null);
  assert.equal(normalizeMax(1), 1);
  assert.equal(normalizeMax(13), 13);
  assert.equal(normalizeMax(0), null);
  assert.equal(normalizeMax(null), null);
  assert.equal(normalizeMax(undefined), null);
  assert.equal(normalizeMax(NaN), null);
});

test("rôles : le nom libre d'un groupe dit à quoi il sert", () => {
  const cases: [string, string][] = [
    ["Choisis ta sauce", "sauce"], ["Sauces supplémentaires", "sauce"], ["Sauce au choix", "sauce"],
    ["Taille", "taille"], ["Junior ou Senior", "taille"], ["Nombre de pièces", "nombre_pieces"],
    ["Choose your drink", "boisson"], ["Boissons supplémentaires", "boisson"],
    ["Crudités", "crudites"], ["Viande au choix", "viande"],
    ["Je le prends sans", "retrait"], ["Faut-il retirer quelque chose ?", "retrait"],
    ["Suppléments", "supplement"], ["Extra topping?", "supplement"],
    ["Accompagnement", "accompagnement"], ["Add a side", "accompagnement"], ["Cuisson", "cuisson"],
    ["Quelque chose d'inattendu", "autre"],
  ];
  for (const [title, role] of cases) assert.equal(canonicalRole(title), role, title);
});
