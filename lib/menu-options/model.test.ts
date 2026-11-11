import { test } from "node:test";
import assert from "node:assert/strict";
import { capacity, classifyKind, defaultSelection, describeSelection, missingGroups, priceCents, validateSelection, validateTree, visibleGroups, MAX_DEPTH } from "./model";
import type { GroupKind, OptionChoice, OptionGroup, Selection } from "./types";

let seq = 0;
const choice = (name: string, over: Partial<OptionChoice> = {}): OptionChoice => ({
  id: `c${++seq}`, libraryId: `l${seq}`, name, priceDelta: 0, maxQty: 1, isDefault: false, isAvailable: true, groups: [], ...over,
});
const group = (title: string, kind: GroupKind, min: number, max: number | null, choices: OptionChoice[], id = `g${++seq}`): OptionGroup => ({ id, title, kind, min, max, choices });

// Un menu comme celui de Belchicken : on choisit ses frites, qui ouvrent la boisson (obligatoire) et des extras.
function finest() {
  const drink = group("Boisson", "inclus", 1, 1, [choice("Pepsi"), choice("Spa Reine")], "boisson");
  const sauce = group("Sauces en plus", "extra", 0, 3, [choice("Samourai", { priceDelta: 1, maxQty: 2 }), choice("Ketchup", { priceDelta: 1 })], "sauce");
  const frites = group("Tes frites", "variante", 1, 1, [choice("Medium Fries", { groups: [drink, sauce] }), choice("Large Fries", { priceDelta: 0.5, groups: [drink, sauce] })], "frites");
  return { frites, drink, sauce, groups: [frites] };
}

test("un sous-groupe n'existe que si son choix est pris", () => {
  const { groups, frites } = finest();
  assert.deepEqual(visibleGroups(groups, {}).map((v) => v.path), ["frites"]);
  const medium = frites.choices[0].id;
  const v = visibleGroups(groups, { frites: { [medium]: 1 } });
  assert.deepEqual(v.map((x) => x.path), ["frites", `frites>${medium}>boisson`, `frites>${medium}>sauce`]);
  assert.deepEqual(v.map((x) => x.depth), [0, 1, 1]);
});

test("le même groupe sous deux choix a deux chemins distincts : changer de frites repart de zéro", () => {
  const { groups, frites } = finest();
  const [m, l] = frites.choices.map((c) => c.id);
  const both = visibleGroups(groups, { frites: { [m]: 1, [l]: 1 } }).map((v) => v.path);
  assert.ok(both.includes(`frites>${m}>boisson`) && both.includes(`frites>${l}>boisson`));
});

test("validation : il manque la boisson, puis tout est bon", () => {
  const { groups, frites, drink } = finest();
  const m = frites.choices[0].id;
  assert.equal(validateSelection(groups, {}).errors[0].code, "minimum");
  const half = { frites: { [m]: 1 } };
  assert.deepEqual(missingGroups(groups, half), ["Boisson"]);
  const ok = { frites: { [m]: 1 }, [`frites>${m}>boisson`]: { [drink.choices[0].id]: 1 } };
  assert.equal(validateSelection(groups, ok).ok, true);
  assert.deepEqual(missingGroups(groups, ok), []);
});

test("validation : maximum, quantité par option, choix en rupture, choix inconnu, groupe inconnu", () => {
  const sauce = group("Sauces", "extra", 0, 3, [choice("A", { priceDelta: 1, maxQty: 2 }), choice("B", { priceDelta: 1 }), choice("C", { priceDelta: 1 }), choice("D", { priceDelta: 1, isAvailable: false })], "s");
  const [a, b, c, d] = sauce.choices.map((x) => x.id);
  const codes = (sel: unknown) => validateSelection([sauce], sel).errors.map((e) => e.code);
  assert.deepEqual(codes({ s: { [a]: 2, [b]: 1 } }), []);
  assert.deepEqual(codes({ s: { [a]: 2, [b]: 1, [c]: 1 } }), ["maximum"]);
  assert.deepEqual(codes({ s: { [a]: 3 } }), ["quantite"]); // 3 fois la même option : trop ; le total (3) reste dans le maximum
  assert.deepEqual(codes({ s: { [d]: 1 } }), ["indisponible"]);
  assert.deepEqual(codes({ s: { zzz: 1 } }), ["choix_inconnu"]);
  assert.deepEqual(codes({ s: {}, ghost: { x: 1 } }), ["groupe_inconnu"]);
});

test("validation : une sélection mal formée est refusée, jamais crue", () => {
  const g = group("Sauce", "inclus", 0, 1, [choice("A")], "s");
  for (const bad of [null, undefined, "x", 3, [1]]) assert.equal(validateSelection([g], bad).ok, false);
  const a = g.choices[0].id;
  for (const n of [-1, 1.5, "1", NaN]) assert.equal(validateSelection([g], { s: { [a]: n } }).ok, false, String(n));
});

test("un groupe sans maximum accepte n'importe quel nombre de choix", () => {
  const g = group("Toppings", "extra", 1, null, [choice("Feta", { priceDelta: 1.5, maxQty: 4 }), choice("Olives", { priceDelta: 1.5, maxQty: 4 })], "t");
  const [f, o] = g.choices.map((c) => c.id);
  assert.equal(validateSelection([g], { t: { [f]: 4, [o]: 4 } }).ok, true);
  assert.equal(validateSelection([g], { t: {} }).errors[0].code, "minimum");
});

test("prix en centimes : article, variante et extras, sans erreur d'arrondi", () => {
  const { groups, frites, drink, sauce } = finest();
  const [m, l] = frites.choices.map((c) => c.id);
  const samourai = sauce.choices[0].id;
  assert.equal(priceCents(11.7, groups, { frites: { [m]: 1 }, [`frites>${m}>boisson`]: { [drink.choices[0].id]: 1 } }), 1170);
  assert.equal(priceCents(11.7, groups, { frites: { [l]: 1 }, [`frites>${l}>sauce`]: { [samourai]: 2 } }), 1170 + 50 + 200);
  // 0,1 + 0,2 : le piège classique des flottants
  const g = group("X", "extra", 0, null, [choice("a", { priceDelta: 0.1 }), choice("b", { priceDelta: 0.2 })], "x");
  assert.equal(priceCents(0, [g], { x: { [g.choices[0].id]: 1, [g.choices[1].id]: 1 } }), 30);
});

test("les choix cochés d'office : crudités toutes cochées, décocher une donne « sans »", () => {
  const crud = group("Crudités", "inclus", 0, 6, ["Salade", "Tomates", "Oignons"].map((n) => choice(n, { isDefault: true })), "crud");
  const sel = defaultSelection([crud]);
  assert.deepEqual(Object.values(sel.crud), [1, 1, 1]);
  assert.deepEqual(describeSelection([crud], sel).map((l) => l.kind), ["inclus", "inclus", "inclus"]);
  const oignons = crud.choices[2].id;
  const sans = describeSelection([crud], { crud: { ...sel.crud, [oignons]: 0 } });
  assert.deepEqual(sans.filter((l) => l.kind === "sans").map((l) => l.name), ["Oignons"]);
});

test("les défauts s'appliquent aussi dans les sous-groupes que le défaut ouvre, et jamais sur un choix en rupture", () => {
  const sub = group("Sauce", "inclus", 0, 1, [choice("Mayo", { isDefault: true })], "sub");
  const top = group("Base", "variante", 1, 1, [choice("Classique", { isDefault: true, groups: [sub] }), choice("Épicée", { isDefault: false, isAvailable: false })], "top");
  const sel = defaultSelection([top]);
  assert.deepEqual(Object.keys(sel).sort(), [`top>${top.choices[0].id}>sub`, "top"].sort());
  const down = group("G", "inclus", 0, 1, [choice("A", { isDefault: true, isAvailable: false })], "d");
  assert.deepEqual(defaultSelection([down]).d, {});
});

test("les retraits sortent en lignes « sans », à 0 €", () => {
  const sans = group("Je le prends sans", "retrait", 0, 6, ["Avocat", "Saumon"].map((n) => choice(n)), "r");
  const [av] = sans.choices;
  const lines = describeSelection([sans], { r: { [av.id]: 1 } });
  assert.deepEqual(lines, [{ kind: "sans", group: "Je le prends sans", name: "Avocat", qty: 1, cents: 0 }]);
});

test("describeSelection : extras avec quantité et prix de la ligne", () => {
  const { groups, frites, sauce } = finest();
  const m = frites.choices[0].id;
  const lines = describeSelection(groups, { frites: { [m]: 1 }, [`frites>${m}>sauce`]: { [sauce.choices[0].id]: 2 } });
  assert.deepEqual(lines.map((l) => [l.kind, l.name, l.qty, l.cents]), [["inclus", "Medium Fries", 1, 0], ["extra", "Samourai", 2, 200]]);
});

test("profondeur : un sous-groupe trop profond n'est jamais ouvert", () => {
  const levels = MAX_DEPTH + 3;
  let inner: OptionGroup | null = null;
  const ids: { gid: string; cid: string }[] = [];
  for (let i = levels - 1; i >= 0; i--) {
    const c = choice(`n${i}`, { groups: inner ? [inner] : [] });
    const g = group(`G${i}`, "inclus", 0, 1, [c], `g${i}`);
    ids[i] = { gid: g.id, cid: c.id };
    inner = g;
  }
  // Le client a « pris » le choix de chaque niveau : seuls MAX_DEPTH + 1 niveaux (0 à MAX_DEPTH) s'ouvrent.
  const sel: Selection = {};
  let path = "";
  for (let i = 0; i < levels; i++) {
    const p = path + ids[i].gid;
    sel[p] = { [ids[i].cid]: 1 };
    path = `${p}>${ids[i].cid}>`;
  }
  const open = visibleGroups([inner as OptionGroup], sel);
  assert.equal(Math.max(...open.map((v) => v.depth)), MAX_DEPTH);
  assert.equal(open.length, MAX_DEPTH + 1);
  // et une sélection qui vise un niveau fermé est refusée
  assert.ok(validateSelection([inner as OptionGroup], sel).errors.some((e) => e.code === "groupe_inconnu"));
});

test("éditeur : bornes, groupe vide, minimum impossible", () => {
  const issues = (g: OptionGroup) => validateTree([g]).map((i) => i.code).sort();
  assert.deepEqual(issues(group("Vide", "inclus", 0, 1, [])), ["vide"]);
  assert.deepEqual(issues(group("Bornes", "inclus", 3, 2, [choice("a", { maxQty: 5 })])), ["bornes"]);
  assert.deepEqual(issues(group("Trop", "inclus", 3, null, [choice("a"), choice("b")])), ["impossible"]);
  assert.deepEqual(issues(group("Max zéro", "inclus", 0, 0, [choice("a")])), ["maximum"]);
  assert.equal(capacity(group("c", "extra", 0, null, [choice("a", { maxQty: 4 }), choice("b", { isAvailable: false })])), 4);
});

test("éditeur : variante, retrait, extra gratuit, inclus payant, défauts", () => {
  const codes = (g: OptionGroup) => validateTree([g]).map((i) => i.code);
  assert.ok(codes(group("Taille", "variante", 0, 2, [choice("a"), choice("b")])).includes("variante"));
  assert.ok(codes(group("Sans", "retrait", 0, 2, [choice("a", { priceDelta: 0.5 })])).includes("retrait_payant"));
  assert.ok(codes(group("Sans", "retrait", 0, 2, [choice("a", { groups: [group("x", "inclus", 0, 1, [choice("y")])] })])).includes("retrait_sous_groupe"));
  assert.ok(codes(group("Extras", "extra", 0, 2, [choice("a"), choice("b")])).includes("extra_gratuit"));
  assert.ok(codes(group("Compris", "inclus", 0, 2, [choice("a", { priceDelta: 1 })])).includes("inclus_payant"));
  assert.ok(codes(group("D", "inclus", 0, 1, [choice("a", { isDefault: true }), choice("b", { isDefault: true })])).includes("defauts"));
  assert.ok(codes(group("P", "extra", 0, 1, [choice("a", { priceDelta: -1 })])).includes("prix"));
});

test("éditeur : une boucle ou une profondeur excessive est une erreur, pas un plantage", () => {
  const a = group("A", "inclus", 0, 1, [choice("x")], "A");
  const b = group("B", "inclus", 0, 1, [choice("y", { groups: [a] })], "B");
  a.choices[0].groups = [b];
  assert.ok(validateTree([a]).some((i) => i.code === "boucle"));
  let g = group("Fond", "inclus", 0, 1, [choice("z")], "fond");
  for (let i = 0; i < MAX_DEPTH + 2; i++) g = group(`G${i}`, "inclus", 0, 1, [choice(`c${i}`, { groups: [g] })], `G${i}`);
  assert.ok(validateTree([g]).some((i) => i.code === "profondeur"));
});

test("classement d'un groupe lu : retrait, compris, extra, variante", () => {
  const k = (title: string, min: number, max: number | null, prices: [string, number][]) => classifyKind({ title, min, max, choices: prices.map(([name, priceDelta]) => ({ name, priceDelta })) });
  assert.equal(k("LE PINK PANTHER JE LE PRENDS SANS", 0, 6, [["SANS AVOCAT", 0], ["SANS SAUMON", 0]]), "retrait");
  assert.equal(k("Faut-il retirer quelque chose ?", 0, 3, [["Oignons", 0], ["Tomates", 0]]), "retrait");
  assert.equal(k("Choose your drink", 1, 1, [["7up", 0], ["Pepsi", 0]]), "inclus");
  assert.equal(k("Sauces supplémentaires", 0, 13, [["Mayo", 1.5], ["Ketchup", 1.5]]), "extra");
  assert.equal(k("Taille", 1, 1, [["Junior", 0], ["Senior", 4]]), "variante");
  assert.equal(k("Suppléments", 0, 5, [["Feta", 1.5], ["Eau", 0]]), "extra");
  // un « sans » payant n'est pas un retrait
  assert.notEqual(k("Sans gluten", 0, 1, [["Pain sans gluten", 2]]), "retrait");
});
