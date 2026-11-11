import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleTrees, type OptionRows } from "./store";
import { validateSelection, visibleGroups } from "./model";

// Un menu : « Tes frites » (Medium ou Large) ouvre deux sous-groupes PARTAGÉS (boisson, sauces).
const rows = (): OptionRows => ({
  library: [
    { id: "lib-med", name: "Medium Fries" }, { id: "lib-lrg", name: "Large Fries" },
    { id: "lib-pep", name: "Pepsi" }, { id: "lib-spa", name: "Spa Reine" }, { id: "lib-sam", name: "Samourai" },
  ],
  groups: [
    { id: "g-frites", title: "Tes frites", kind: "variante", min_choices: 1, max_choices: 1 },
    { id: "g-boisson", title: "Boisson", kind: "inclus", min_choices: 1, max_choices: 1 },
    { id: "g-sauce", title: "Sauces en plus", kind: "extra", min_choices: 0, max_choices: 3 },
  ],
  choices: [
    { id: "c-med", group_id: "g-frites", library_id: "lib-med", price_delta: "0.00", max_qty: 1, is_default: false, is_available: true, position: 1 },
    { id: "c-lrg", group_id: "g-frites", library_id: "lib-lrg", price_delta: "0.50", max_qty: 1, is_default: false, is_available: true, position: 2 },
    { id: "c-spa", group_id: "g-boisson", library_id: "lib-spa", price_delta: 0, max_qty: 1, is_default: false, is_available: true, position: 2 },
    { id: "c-pep", group_id: "g-boisson", library_id: "lib-pep", price_delta: 0, max_qty: 1, is_default: false, is_available: true, position: 1 },
    { id: "c-sam", group_id: "g-sauce", library_id: "lib-sam", price_delta: "1.00", max_qty: 2, is_default: false, is_available: true, position: 1 },
  ],
  choiceGroups: [
    { choice_id: "c-med", group_id: "g-sauce", position: 2 }, { choice_id: "c-med", group_id: "g-boisson", position: 1 },
    { choice_id: "c-lrg", group_id: "g-boisson", position: 1 }, { choice_id: "c-lrg", group_id: "g-sauce", position: 2 },
  ],
  itemGroups: [{ menu_item_id: "item-finest", group_id: "g-frites", position: 1 }],
});

test("assemblage : un arbre par article, positions respectées, prix lus en nombres", () => {
  const trees = assembleTrees(rows());
  const t = trees.get("item-finest")!;
  assert.equal(t.length, 1);
  const frites = t[0];
  assert.deepEqual(frites.choices.map((c) => [c.name, c.priceDelta]), [["Medium Fries", 0], ["Large Fries", 0.5]]);
  const [boisson, sauce] = frites.choices[0].groups;
  assert.equal(boisson.title, "Boisson");
  assert.deepEqual(boisson.choices.map((c) => c.name), ["Pepsi", "Spa Reine"]); // par position, pas par ordre de lecture
  assert.equal(sauce.choices[0].maxQty, 2);
});

test("assemblage : les groupes partagés servent aux deux tailles, avec des chemins distincts", () => {
  const t = assembleTrees(rows()).get("item-finest")!;
  const [m, l] = t[0].choices.map((c) => c.id);
  const paths = visibleGroups(t, { "g-frites": { [m]: 1, [l]: 1 } }).map((v) => v.path);
  assert.ok(paths.includes(`g-frites>${m}>g-boisson`) && paths.includes(`g-frites>${l}>g-boisson`));
  const pep = t[0].choices[0].groups[0].choices[0].id;
  const ok = validateSelection(t, { "g-frites": { [m]: 1 }, [`g-frites>${m}>g-boisson`]: { [pep]: 1 } });
  assert.equal(ok.ok, true);
});

test("assemblage : une boucle est coupée, jamais suivie", () => {
  const r = rows();
  r.choiceGroups.push({ choice_id: "c-sam", group_id: "g-frites", position: 1 }); // sauce → frites → sauce…
  const t = assembleTrees(r).get("item-finest")!;
  const sauce = t[0].choices[0].groups.find((g) => g.id === "g-sauce")!;
  assert.deepEqual(sauce.choices[0].groups, []); // « frites » est un ancêtre : coupé
});

test("assemblage : un choix dont l'option a disparu de la bibliothèque est ignoré, un article sans lien n'a pas d'arbre", () => {
  const r = rows();
  r.library = r.library.filter((l) => l.id !== "lib-pep");
  const t = assembleTrees(r).get("item-finest")!;
  assert.deepEqual(t[0].choices[0].groups[0].choices.map((c) => c.name), ["Spa Reine"]);
  assert.equal(assembleTrees({ ...rows(), itemGroups: [] }).size, 0);
  assert.equal(assembleTrees(rows()).get("autre-article"), undefined);
});
