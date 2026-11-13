import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addArticle, addChoice, addGroup, applyBulkPrice, buildEditor, canValidate, confirmGroup, lotIssues, mergeLots, mergeSuggestions,
  pricesMissing, removeArticle, removeGroup, reopenLot, savePayload, splitArticle, toOptionTrees, traceOf, updateChoice, updateGroup, validateLot,
  type ArticleRef, type EditorState, type Lot,
} from "./lots";
import { descriptionOf, editDescription, lotConflicts, resetDescription, setTone, setViande } from "./lots";
import { validateTree } from "./model";

let n = 0;
const art = (name: string, category = ""): ArticleRef => ({ id: `a${++n}`, name, category });

// Un snack-pizzeria comme celui de la maquette : mitraillettes, durums, pains turcs, paninis, pizzas, pâtes, burgers,
// boissons, desserts, un sandwich, et des articles que nous ne savons pas ranger.
function carte() {
  const mit = ["kefta", "poulet", "merguez"].map((x) => art(`Mitraillette ${x}`));
  const dur = ["poulet", "kefta"].map((x) => art(`Durum ${x}`));
  const pt = [art("Pain turc poulet")];
  const pan = [art("Panini jambon fromage"), art("Panini thon")];
  const sand = [art("Sandwich américain")];
  const piz = ["Margherita", "Royale"].map((x) => art(`Pizza ${x}`));
  const pat = [art("Pâtes carbonara")];
  const bur = [art("Cheese burger"), art("Burger poulet croustillant")];
  const bois = [art("Coca-Cola 33 cl", "Boissons"), art("Eau pétillante", "Boissons")];
  const des = [art("Tiramisu", "Desserts")];
  const menu = [art("Menu mitraillette", "Menus")];
  const bizarre = [art("Spécialité du chef")];
  return { all: [...mit, ...dur, ...pt, ...pan, ...sand, ...piz, ...pat, ...bur, ...bois, ...des, ...menu, ...bizarre], mit, dur, pt, pan, sand, piz, pat, bur, bois, des, menu, bizarre };
}

const lotByLabel = (s: EditorState, start: string) => s.lots.find((l) => l.label.startsWith(start))!;
const ids = (xs: ArticleRef[]) => xs.map((x) => x.id).sort();

/** Donne un prix à tout ce qui en attend un, puis valide : le chemin le plus court vers un lot validé. */
function priceAndValidate(s: EditorState, lot: Lot, price = 1): EditorState {
  let next = s;
  for (const g of lot.groups) next = applyBulkPrice(next, lot.key, g.key, price);
  return validateLot(next, lot.key);
}

test("les articles sont rangés par famille, et ce qu'on ne sait pas ranger reste à part", () => {
  const c = carte();
  const s = buildEditor(c.all);
  assert.deepEqual(s.lots.map((l) => l.label), ["Mitraillettes", "Durums, pains turcs, paninis et sandwichs", "Burgers", "Pizzas", "Pâtes", "Boissons et desserts"]);
  assert.deepEqual(ids([...s.unplaced.map((id) => s.articles[id])]), ids([...c.menu, ...c.bizarre]));
});

test("durums, pains turcs et paninis ne font qu'un lot : les paninis et sandwichs y sont PROPOSÉS, pas imposés", () => {
  const c = carte();
  const s = buildEditor(c.all);
  const lot = lotByLabel(s, "Durums");
  assert.deepEqual(ids(lot.articleIds.map((id) => s.articles[id])), ids([...c.dur, ...c.pt, ...c.pan, ...c.sand]));
  assert.deepEqual(lot.suggestedIds.slice().sort(), ids([...c.pan, ...c.sand]));
  assert.equal(s.stats.suggested, 3);
  assert.equal(lot.strength, "forte");
});

test("sans durum ni pain turc, un panini a son propre lot : rien à proposer", () => {
  const p = art("Panini poulet");
  const s = buildEditor([p, art("Pizza Royale")]);
  const lot = lotByLabel(s, "Paninis");
  assert.deepEqual(lot.articleIds, [p.id]);
  assert.deepEqual(lot.suggestedIds, []);
  assert.equal(lot.strength, "moyenne");
});

test("la confiance d'un lot suit sa famille : forte, faible, ou sans choix", () => {
  const s = buildEditor(carte().all);
  assert.equal(lotByLabel(s, "Mitraillettes").strength, "forte");
  assert.equal(lotByLabel(s, "Pizzas").strength, "faible");
  const sans = lotByLabel(s, "Boissons");
  assert.equal(sans.strength, "aucune");
  assert.deepEqual(sans.groups, []);
});

test("AUCUN prix n'est prérempli : suppléments et variantes payantes attendent le restaurateur", () => {
  const s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  assert.ok(pricesMissing(mit) > 0);
  for (const g of mit.groups) {
    for (const c of g.choices) {
      if (g.kind === "extra") assert.equal(c.priceDelta, null, `${g.title} / ${c.name}`);
      if (g.kind === "inclus" || g.kind === "retrait") assert.equal(c.priceDelta, 0);
    }
  }
  const taille = lotByLabel(s, "Pizzas").groups.find((g) => g.title === "Taille")!;
  assert.equal(taille.choices[0].priceDelta, 0); // la taille de base : coché d'office, pas de supplément
  assert.equal(taille.choices[1].priceDelta, null); // 33 cm : son prix à lui
});

test("un lot ne se valide pas tant qu'un prix manque, et la validation dit combien", () => {
  const s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  assert.equal(canValidate(mit), false);
  assert.equal(validateLot(s, mit.key).lots.find((l) => l.key === mit.key)!.validated, false);
  assert.equal(lotIssues(mit).pricesMissing, pricesMissing(mit));
});

test("le même prix pour tous remplit les prix manquants d'une liste, pas les autres", () => {
  let s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  const supp = mit.groups.find((g) => g.title === "Suppléments")!;
  s = applyBulkPrice(s, mit.key, supp.key, 1.5);
  const after = lotByLabel(s, "Mitraillettes");
  assert.ok(after.groups.find((g) => g.title === "Suppléments")!.choices.every((c) => c.priceDelta === 1.5));
  assert.equal(after.pricesSet, 4);
  assert.ok(pricesMissing(after) > 0, "le prix des frites manque encore");
});

test("décocher un choix qui attendait un prix le retire de la liste des prix à mettre", () => {
  let s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  const supp = mit.groups.find((g) => g.title === "Suppléments")!;
  const before = pricesMissing(mit);
  s = updateChoice(s, mit.key, supp.choices[0].key, { keep: false });
  assert.equal(pricesMissing(lotByLabel(s, "Mitraillettes")), before - 1);
});

test("un lot complet se valide, se rouvre, et ses groupes à confirmer sont confirmés", () => {
  let s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  assert.equal(lotIssues(mit).pending, 1); // « Ajouter des frites ? » : nous ne sommes pas sûrs de sa sorte
  s = priceAndValidate(s, mit);
  const done = lotByLabel(s, "Mitraillettes");
  assert.equal(done.validated, true);
  assert.equal(lotIssues(done).pending, 0);
  s = reopenLot(s, done.key);
  assert.equal(lotByLabel(s, "Mitraillettes").validated, false);
});

test("la structure d'un lot validé tient : elle passe la validation du modèle sans erreur", () => {
  let s = buildEditor(carte().all);
  for (const lot of s.lots) s = priceAndValidate(s, s.lots.find((l) => l.key === lot.key)!);
  assert.ok(s.lots.every((l) => l.validated), "tous les lots d'exemple se valident une fois les prix donnés");
  for (const lot of s.lots) assert.deepEqual(validateTree(toOptionTrees(lot)).filter((i) => i.level === "erreur"), []);
});

test("une liste sans aucun choix gardé, un nom vide ou un doublon bloquent la validation", () => {
  let s = buildEditor(carte().all);
  const piz = lotByLabel(s, "Pizzas");
  s = priceAndValidate(s, piz);
  s = reopenLot(s, piz.key);
  let lot = lotByLabel(s, "Pizzas");
  const retrait = lot.groups.find((g) => g.kind === "retrait")!;
  s = updateChoice(s, lot.key, retrait.choices[0].key, { keep: false });
  lot = lotByLabel(s, "Pizzas");
  assert.ok(lotIssues(lot).errors.some((e) => e.code === "vide"));
  s = removeGroup(s, lot.key, retrait.key);
  assert.equal(canValidate(lotByLabel(s, "Pizzas")), true);

  s = addGroup(s, lot.key);
  const added = lotByLabel(s, "Pizzas").groups.at(-1)!;
  assert.ok(lotIssues(lotByLabel(s, "Pizzas")).errors.some((e) => e.code === "nom"), "le choix ajouté n'a pas de nom");
  s = updateChoice(s, lot.key, added.choices[0].key, { name: "Mozzarella", priceDelta: 1 });
  s = updateGroup(s, lot.key, added.key, { title: "Suppléments" });
  s = addChoice(s, lot.key, added.key);
  s = updateChoice(s, lot.key, lotByLabel(s, "Pizzas").groups.at(-1)!.choices[1].key, { name: "mozzarella", priceDelta: 1 });
  assert.ok(lotIssues(lotByLabel(s, "Pizzas")).errors.some((e) => e.code === "doublon"), "« Mozzarella » et « mozzarella » sont le même choix");
});

test("passer un groupe en « à enlever » le rend gratuit, sans limite, sans question de plus", () => {
  let s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  const supp = mit.groups.find((g) => g.title === "Suppléments")!;
  s = updateGroup(s, mit.key, supp.key, { kind: "retrait" });
  const g = lotByLabel(s, "Mitraillettes").groups.find((x) => x.key === supp.key)!;
  assert.equal(g.min, 0);
  assert.equal(g.max, null);
  assert.ok(g.choices.every((c) => c.priceDelta === 0 && !c.isDefault && c.groups.length === 0));
});

test("minimum et maximum restent cohérents quand on les change", () => {
  let s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  const sauces = mit.groups.find((g) => g.title === "Sauces")!;
  s = updateGroup(s, mit.key, sauces.key, { min: 3 });
  assert.deepEqual([lotByLabel(s, "Mitraillettes").groups.find((g) => g.key === sauces.key)!.min, lotByLabel(s, "Mitraillettes").groups.find((g) => g.key === sauces.key)!.max], [3, 3]);
  s = updateGroup(s, mit.key, sauces.key, { max: 1 });
  assert.deepEqual([lotByLabel(s, "Mitraillettes").groups.find((g) => g.key === sauces.key)!.min, lotByLabel(s, "Mitraillettes").groups.find((g) => g.key === sauces.key)!.max], [1, 1]);
});

test("retirer un article proposé le sort du lot, le met à part, et le compte pour la trace", () => {
  const c = carte();
  let s = buildEditor(c.all);
  s = removeArticle(s, c.pan[0].id);
  const lot = lotByLabel(s, "Durums");
  assert.ok(!lot.articleIds.includes(c.pan[0].id));
  assert.ok(s.unplaced.includes(c.pan[0].id));
  assert.equal(traceOf(s).suggestedKept, 2);
  assert.equal(traceOf(s).suggested, 3);
});

test("ajouter un article à un lot, depuis les non-rangés ou depuis un autre lot, lui donne les options du lot", () => {
  const c = carte();
  let s = buildEditor(c.all);
  const dur = lotByLabel(s, "Durums");
  s = addArticle(s, dur.key, c.bizarre[0].id);
  assert.ok(lotByLabel(s, "Durums").articleIds.includes(c.bizarre[0].id));
  assert.ok(!s.unplaced.includes(c.bizarre[0].id));
  s = addArticle(s, dur.key, c.pat[0].id); // pris dans le lot des pâtes : ce lot n'a plus d'article, il disparaît
  assert.ok(!s.lots.some((l) => l.label === "Pâtes"));
  assert.equal(traceOf(s).added, 2);
});

test("réunir deux lots : les articles du second prennent les options du premier", () => {
  const c = carte();
  let s = buildEditor(c.all);
  const mit = lotByLabel(s, "Mitraillettes"), dur = lotByLabel(s, "Durums");
  const sug = mergeSuggestions(s);
  assert.equal(sug.length, 1);
  assert.deepEqual([sug[0].intoKey, sug[0].fromKey], [mit.key, dur.key]);
  s = mergeLots(s, mit.key, dur.key);
  const merged = lotByLabel(s, "Mitraillettes");
  assert.equal(merged.articleIds.length, c.mit.length + c.dur.length + c.pt.length + c.pan.length + c.sand.length);
  assert.equal(mergeSuggestions(s).length, 0);
  assert.equal(traceOf(s).merges, 1);
});

test("une réunion n'est plus proposée quand un des deux lots est validé", () => {
  let s = buildEditor(carte().all);
  s = priceAndValidate(s, lotByLabel(s, "Mitraillettes"));
  assert.equal(mergeSuggestions(s).length, 0);
});

test("un article qui a d'autres choix sort du lot avec une copie des options, et sans toucher l'original", () => {
  const c = carte();
  let s = buildEditor(c.all);
  const mit = lotByLabel(s, "Mitraillettes");
  s = splitArticle(s, c.mit[2].id);
  const solo = s.lots.find((l) => l.label === "Mitraillette merguez")!;
  assert.deepEqual(solo.articleIds, [c.mit[2].id]);
  assert.equal(solo.groups.length, mit.groups.length);
  assert.notEqual(solo.groups[0].key, mit.groups[0].key, "des clés neuves : régler l'un ne règle pas l'autre");
  s = updateChoice(s, solo.key, solo.groups[1].choices[0].key, { keep: false });
  assert.ok(lotByLabel(s, "Mitraillettes").groups[1].choices[0].keep);
});

test("on ne sort pas le dernier article d'un lot (il est déjà seul)", () => {
  const p = art("Pizza Royale");
  let s = buildEditor([p]);
  s = splitArticle(s, p.id);
  assert.equal(s.lots.length, 1);
});

test("confirmer un groupe dont nous n'étions pas sûrs enlève la ligne à regarder", () => {
  let s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  const frites = mit.groups.find((g) => g.guess)!;
  s = confirmGroup(s, mit.key, frites.key);
  assert.equal(lotIssues(lotByLabel(s, "Mitraillettes")).pending, 0);
});

test("ce qu'on enregistre : seulement les lots validés, seulement les choix gardés, jamais un prix manquant", () => {
  let s = buildEditor(carte().all);
  assert.deepEqual(savePayload(s), []);
  const mit = lotByLabel(s, "Mitraillettes");
  const sauces = mit.groups.find((g) => g.title === "Sauces")!;
  s = updateChoice(s, mit.key, sauces.choices[4].key, { keep: false }); // « Tartare » : il n'en vend pas
  s = priceAndValidate(s, lotByLabel(s, "Mitraillettes"), 1.2);
  const payload = savePayload(s);
  assert.equal(payload.length, 1);
  const saved = payload[0].groups.find((g) => g.title === "Sauces")!;
  assert.deepEqual(saved.choices.map((c) => c.name), ["Ketchup", "Andalouse", "Mayonnaise", "Samouraï"]);
  const supp = payload[0].groups.find((g) => g.title === "Suppléments")!;
  assert.ok(supp.choices.every((c) => c.priceDelta === 1.2));
  assert.ok(payload[0].groups.every((g) => g.choices.every((c) => typeof c.priceDelta === "number" && Number.isFinite(c.priceDelta))));
  const frites = payload[0].groups.find((g) => g.title === "Ajouter des frites ?")!;
  assert.equal(frites.choices[0].groups[0].title, "Sauce frites", "la sous-question suit son choix");
  assert.equal(payload[0].articleIds.length, 3);
});

test("la trace dit ce que le restaurateur a gardé et changé, par lot validé", () => {
  let s = buildEditor(carte().all);
  const mit = lotByLabel(s, "Mitraillettes");
  const sauces = mit.groups.find((g) => g.title === "Sauces")!;
  const proposed = mit.proposed;
  s = updateChoice(s, mit.key, sauces.choices[4].key, { keep: false });
  s = priceAndValidate(s, lotByLabel(s, "Mitraillettes"));
  const t = savePayload(s)[0].trace;
  assert.equal(t.family, "mitraillette");
  assert.equal(t.strength, "forte");
  assert.equal(t.proposed, proposed);
  assert.equal(t.kept, proposed - 1);
  assert.equal(t.edits, 1);
  assert.equal(t.pricesSet, 5);
  const all = traceOf(s);
  assert.equal(all.lotsSaved, 1);
  assert.equal(all.unplaced, 2);
  assert.equal(all.articles, carte().all.length);
});

test("une mitraillette seule dans un catalogue minuscule se règle de bout en bout", () => {
  const a = art("Mitraillette kefta");
  let s = buildEditor([a]);
  assert.equal(s.lots.length, 1);
  s = priceAndValidate(s, s.lots[0]);
  assert.equal(savePayload(s)[0].articleIds[0], a.id);
});

test("un catalogue vide donne un éditeur vide, sans erreur", () => {
  const s = buildEditor([]);
  assert.deepEqual([s.lots, s.unplaced], [[], []]);
  assert.equal(traceOf(s).articles, 0);
});

test("buildEditor ne partage aucune clé entre deux lots (régler l'un ne règle jamais l'autre)", () => {
  const s = buildEditor(carte().all);
  const keys = new Set<string>();
  let total = 0;
  const walk = (gs: Lot["groups"]) => gs.forEach((g) => { keys.add(g.key); total++; g.choices.forEach((c) => { keys.add(c.key); total++; walk(c.groups); }); });
  s.lots.forEach((l) => { keys.add(l.key); total++; walk(l.groups); });
  assert.equal(keys.size, total);
});

// ─── Les descriptions (ADR 0100 §7) ──────────────────────────────────────────

const desc = (s: EditorState, lotLabel: string, article: ArticleRef) => descriptionOf(s, lotByLabel(s, lotLabel), article.id);

test("par défaut le ton est gourmand : chaque plat reçoit sa description d'après son nom", () => {
  const c = carte();
  const s = buildEditor(c.all);
  assert.equal(s.tone, "gourmand");
  const d = desc(s, "Mitraillettes", c.mit[0])!;
  assert.match(d.text, /^Une mitraillette kefta, pour /);
  assert.equal(d.source, "generated");
  assert.match(desc(s, "Pizzas", c.piz[0])!.text, /^Une pizza Margherita, /);
});

test("boissons, desserts, formules et inconnus n'ont pas de description", () => {
  const c = carte();
  const s = buildEditor(c.all);
  assert.equal(desc(s, "Boissons", c.bois[0]), null);
  assert.equal(desc(s, "Boissons", c.des[0]), null);
});

test("changer le ton réécrit toutes les descriptions composées, pas celles que le restaurateur a écrites", () => {
  const c = carte();
  let s = editDescription(buildEditor(c.all), c.piz[1].id, "La Royale de la maison.");
  s = setTone(s, "sobre");
  assert.equal(desc(s, "Pizzas", c.piz[0])!.text, "Une pizza Margherita.");
  assert.equal(desc(s, "Pizzas", c.piz[1])!.text, "La Royale de la maison.", "son texte n'est pas touché");
  assert.equal(descriptionOf(s, lotByLabel(s, "Pizzas"), c.piz[1].id)!.source, "restaurateur");
});

test("la question de viande des burgers n'écrit la viande que si le restaurateur répond", () => {
  const c = carte();
  let s = buildEditor(c.all);
  const lot = lotByLabel(s, "Burgers");
  s = setTone(s, "sobre");
  assert.equal(descriptionOf(s, lot, c.bur[0].id)!.text, "Un burger au fromage.", "pas de viande inventée");
  s = setViande(s, lot.key, "bœuf");
  assert.equal(descriptionOf(s, lotByLabel(s, "Burgers"), c.bur[0].id)!.text, "Un burger de bœuf au fromage.");
  assert.equal(descriptionOf(s, lotByLabel(s, "Burgers"), c.bur[1].id)!.text, "Un burger au poulet croustillant.", "le nom prime");
});

test("un nom qui contredit la réponse est signalé, et corriger la description l'efface", () => {
  const c = carte();
  let s = setViande(buildEditor(c.all), lotByLabel(buildEditor(c.all), "Burgers").key, "bœuf");
  const lot = lotByLabel(s, "Burgers");
  const conflicts = lotConflicts(s, lot);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].articleId, c.bur[1].id);
  assert.match(conflicts[0].message, /poulet croustillant.*bœuf/);
  s = editDescription(s, c.bur[1].id, "Notre burger poulet.");
  assert.deepEqual(lotConflicts(s, lotByLabel(s, "Burgers")), [], "il a écrit la sienne : plus rien à signaler");
});

test("réécrire une description la garde ; retaper exactement la nôtre revient à ne rien avoir changé ; la vider est un choix", () => {
  const c = carte();
  let s = buildEditor(c.all);
  const id = c.dur[0].id;
  const ours = desc(s, "Durums", c.dur[0])!.text;
  s = editDescription(s, id, "  Le durum   du patron. ");
  assert.equal(s.descEdits[id], "Le durum du patron.");
  s = editDescription(s, id, ours);
  assert.equal(id in s.descEdits, false);
  s = editDescription(s, id, "");
  assert.equal(s.descEdits[id], "");
  assert.equal(descriptionOf(s, lotByLabel(s, "Durums"), id)!.text, "");
  s = resetDescription(s, id);
  assert.equal(desc(s, "Durums", c.dur[0])!.text, ours);
});

test("une description est limitée à 300 lettres et sans balise", () => {
  const c = carte();
  const s = editDescription(buildEditor(c.all), c.piz[0].id, `<b>${"x".repeat(500)}</b>`);
  assert.equal(s.descEdits[c.piz[0].id].length, 300);
  assert.ok(!/[<>]/.test(s.descEdits[c.piz[0].id]));
});

test("ce qu'on enregistre contient une description par plat décrit, avec son origine", () => {
  const c = carte();
  let s = editDescription(buildEditor(c.all), c.piz[0].id, "Notre classique.");
  s = setTone(s, "sobre");
  for (const lot of s.lots) { for (const g of s.lots.find((x) => x.key === lot.key)!.groups) s = applyBulkPrice(s, lot.key, g.key, 1); s = validateLot(s, lot.key); }
  const payload = savePayload(s);
  const pizzas = payload.find((p) => p.articleIds.includes(c.piz[0].id))!;
  assert.deepEqual(pizzas.descriptions.map((d) => [d.articleId, d.text, d.source]), [
    [c.piz[0].id, "Notre classique.", "restaurateur"],
    [c.piz[1].id, "Une pizza Royale.", "generated"],
  ]);
  const boissons = payload.find((p) => p.articleIds.includes(c.bois[0].id))!;
  assert.deepEqual(boissons.descriptions, [], "aucune description pour les boissons et desserts");
});

test("la trace compte les descriptions composées, gardées, réécrites et vidées", () => {
  const c = carte();
  let s = buildEditor(c.all);
  s = editDescription(s, c.mit[0].id, "La mitraillette du chef.");
  s = editDescription(s, c.mit[1].id, "");
  const lot = lotByLabel(s, "Mitraillettes");
  for (const g of lot.groups) s = applyBulkPrice(s, lot.key, g.key, 1);
  s = validateLot(s, lot.key);
  const t = savePayload(s)[0].trace;
  assert.deepEqual([t.descGenerated, t.descKept, t.descEdited, t.descCleared], [3, 1, 1, 1]);
  assert.deepEqual([traceOf(s).descGenerated, traceOf(s).descKept, traceOf(s).descEdited, traceOf(s).descCleared], [3, 1, 1, 1]);
});

test("sortir un plat d'un groupe garde la réponse de viande ; ses descriptions écrites le suivent partout", () => {
  const c = carte();
  let s = buildEditor(c.all);
  s = setViande(s, lotByLabel(s, "Burgers").key, "poulet");
  s = editDescription(s, c.mit[0].id, "À moi.");
  s = splitArticle(s, c.bur[0].id);
  assert.equal(s.lots.find((l) => l.label === "Cheese burger")!.viande, "poulet");
  s = splitArticle(s, c.mit[0].id);
  const solo = s.lots.find((l) => l.label === "Mitraillette kefta")!;
  assert.equal(descriptionOf(s, solo, c.mit[0].id)!.text, "À moi.");
});
