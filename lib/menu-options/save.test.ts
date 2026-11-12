import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OptionsUnavailableError, checkPayload, saveLots,
  type ChoiceGroupInsert, type ChoiceInsert, type GroupInsert, type ItemLinkInsert, type OptionsDb, type SetupRow,
} from "./save";
import { applyBulkPrice, buildEditor, savePayload, validateLot, type SaveGroup, type SaveLot } from "./lots";

// Une base en mémoire qui se comporte comme Postgres sur ce qui compte : les clés uniques de la bibliothèque et les
// suppressions en cascade (groupe → choix → sous-groupes et liens des articles).
class MemDb implements OptionsDb {
  library = new Map<string, string>(); // `${restaurant}|${key}` → id
  groups = new Map<string, GroupInsert>();
  choices = new Map<string, ChoiceInsert>();
  choiceGroups: ChoiceGroupInsert[] = [];
  links: ItemLinkInsert[] = [];
  owned = new Set<string>();
  setups: SetupRow[] = [];
  traceTable = true;
  failOn: string | null = null;
  private seq = 0;
  private maybeFail(step: string) { if (this.failOn === step) throw new Error(`panne simulée : ${step}`); }

  async ownedArticleIds(_r: string, ids: string[]) { return ids.filter((i) => this.owned.has(i)); }
  async linkedGroupIds(articleIds: string[]) { return [...new Set(this.links.filter((l) => articleIds.includes(l.menu_item_id)).map((l) => l.group_id))]; }
  async ensureLibrary(restaurantId: string, entries: { name: string; key: string }[]) {
    const out = new Map<string, string>();
    for (const e of entries) {
      const k = `${restaurantId}|${e.key}`;
      if (!this.library.has(k)) this.library.set(k, `lib${++this.seq}`);
      out.set(e.key, this.library.get(k)!);
    }
    return out;
  }
  async insertGroups(rows: GroupInsert[]) { this.maybeFail("insertGroups"); rows.forEach((r) => this.groups.set(r.id, r)); }
  async insertChoices(rows: ChoiceInsert[]) { this.maybeFail("insertChoices"); rows.forEach((r) => this.choices.set(r.id, r)); }
  async insertChoiceGroups(rows: ChoiceGroupInsert[]) { this.maybeFail("insertChoiceGroups"); this.choiceGroups.push(...rows); }
  async linkArticles(rows: ItemLinkInsert[]) { this.maybeFail("linkArticles"); this.links.push(...rows); }
  async unlink(articleIds: string[], keep: string[]) { this.maybeFail("unlink"); this.links = this.links.filter((l) => !(articleIds.includes(l.menu_item_id) && !keep.includes(l.group_id))); }
  async childGroupIds(groupIds: string[]) {
    const cids = [...this.choices.values()].filter((c) => groupIds.includes(c.group_id)).map((c) => c.id);
    return [...new Set(this.choiceGroups.filter((cg) => cids.includes(cg.choice_id)).map((cg) => cg.group_id))];
  }
  async itemLinkedGroups(groupIds: string[]) { return [...new Set(this.links.filter((l) => groupIds.includes(l.group_id)).map((l) => l.group_id))]; }
  async choiceReferencedGroups(groupIds: string[]) { return [...new Set(this.choiceGroups.filter((cg) => groupIds.includes(cg.group_id)).map((cg) => cg.group_id))]; }
  async deleteGroups(ids: string[]) {
    const gone = new Set(ids);
    const deadChoices = new Set([...this.choices.values()].filter((c) => gone.has(c.group_id)).map((c) => c.id));
    ids.forEach((id) => this.groups.delete(id));
    deadChoices.forEach((id) => this.choices.delete(id));
    this.choiceGroups = this.choiceGroups.filter((cg) => !deadChoices.has(cg.choice_id) && !gone.has(cg.group_id));
    this.links = this.links.filter((l) => !gone.has(l.group_id));
  }
  async writeSetup(row: SetupRow) { if (!this.traceTable) return false; this.setups.push(row); return true; }

  groupTitles(articleId: string) { return this.links.filter((l) => l.menu_item_id === articleId).sort((a, b) => a.position - b.position).map((l) => this.groups.get(l.group_id)!.title); }
}

const choice = (name: string, priceDelta = 0, groups: SaveGroup[] = []): SaveGroup["choices"][number] => ({ name, priceDelta, maxQty: 1, isDefault: false, groups });
const sauces = (names = ["Ketchup", "Mayonnaise"]): SaveGroup => ({ title: "Sauces", kind: "inclus", min: 1, max: 2, choices: names.map((n) => choice(n)) });
const supplements = (): SaveGroup => ({ title: "Suppléments", kind: "extra", min: 0, max: 3, choices: [choice("Feta", 1), choice("Olives", 1.5)] });
const lot = (articleIds: string[], groups: SaveGroup[]): SaveLot => ({ articleIds, groups, trace: { family: "mitraillette", strength: "forte", articles: articleIds.length, proposed: 6, kept: 5, added: 0, edits: 1, pricesSet: 2 } });
const db0 = (...articles: string[]) => { const d = new MemDb(); articles.forEach((a) => d.owned.add(a)); return d; };
const save = (db: MemDb, lots: unknown, trace: unknown = { articles: 3, lots: 1 }) => saveLots(db, "resto", lots, trace, "user-1");

// ─── La lecture stricte ──────────────────────────────────────────────────────

test("une charge utile valide est acceptée et ses noms nettoyés", () => {
  const r = checkPayload([lot(["a1"], [{ ...sauces(["  Ketchup  ", "Mayo"]) }])]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.lots[0].groups[0].choices.map((c) => c.name), ["Ketchup", "Mayo"]);
});

test("ce qui n'est pas valide est refusé avec une phrase claire", () => {
  const bad = (payload: unknown, fragment: RegExp) => {
    const r = checkPayload(payload);
    assert.equal(r.ok, false, JSON.stringify(payload).slice(0, 80));
    if (!r.ok) assert.ok(r.errors.some((e) => fragment.test(e)), r.errors.join(" | "));
  };
  bad([], /Rien à enregistrer/);
  bad("oups", /Rien à enregistrer/);
  bad([lot([], [sauces()])], /liste des plats/);
  bad([lot(["a1"], [{ ...sauces(), kind: "magique" as never }])], /genre de choix inconnu/);
  bad([lot(["a1"], [{ ...supplements(), choices: [{ ...choice("Feta"), priceDelta: null as never }] }])], /prix entre 0 et 100/);
  bad([lot(["a1"], [{ ...supplements(), choices: [choice("Feta", -1)] }])], /prix entre 0 et 100/);
  bad([lot(["a1"], [{ ...supplements(), choices: [choice("Feta", 1000)] }])], /prix entre 0 et 100/);
  bad([lot(["a1"], [{ ...sauces(), title: "x".repeat(81) }])], /pas de nom/);
  bad([lot(["a1"], [{ ...sauces(), choices: [choice("")] }])], /n'a pas de nom/);
  bad([lot(["a1"], [{ ...sauces(), choices: [] }])], /n'a aucun choix/);
  bad([lot(["a1"], [sauces(["Ketchup", "ketchup"])])], /écrit deux fois/);
  bad([lot(["a1"], [{ title: "Sans", kind: "retrait", min: 0, max: null, choices: [choice("Oignons", 1)] }])], /ne coûte rien/);
  bad([lot(["a1"], [{ ...sauces(), min: 3, max: 1 }])], /maximum est plus petit/);
  bad([lot(["a1"], [sauces()]), lot(["a1", "a2"], [sauces()])], /deux groupes à la fois/);
  bad([lot(["a1"], [{ ...sauces(), choices: [{ ...choice("A"), maxQty: 99 }] }])], /1 à 20 fois/);
});

test("trop de niveaux de questions imbriquées est refusé", () => {
  let deep: SaveGroup = { title: "N4", kind: "inclus", min: 0, max: 1, choices: [choice("x")] };
  for (const t of ["N3", "N2", "N1", "N0"]) deep = { title: t, kind: "inclus", min: 0, max: 1, choices: [choice("y", 0, [deep])] };
  const r = checkPayload([lot(["a1"], [deep])]);
  assert.equal(r.ok, false);
});

// ─── L'écriture ──────────────────────────────────────────────────────────────

test("les groupes sont écrits une fois par groupe de plats, et partagés par tous ses articles", async () => {
  const db = db0("a1", "a2", "a3");
  const r = await save(db, [lot(["a1", "a2", "a3"], [sauces(), supplements()])]);
  assert.deepEqual(r, { ok: true, lots: 1, articles: 3, groups: 2, choices: 4, traceSaved: true });
  assert.equal(db.groups.size, 2, "deux groupes pour trois articles : le groupe est partagé");
  assert.equal(db.links.length, 6);
  assert.deepEqual(db.groupTitles("a2"), ["Sauces", "Suppléments"]);
  const feta = [...db.choices.values()].find((c) => c.price_delta === 1)!;
  assert.equal(feta.max_qty, 1);
});

test("la bibliothèque est partagée : la même sauce écrite deux fois n'existe qu'une fois", async () => {
  const db = db0("a1", "a2");
  await save(db, [lot(["a1"], [sauces(["Samouraï", "Ketchup"])]), lot(["a2"], [sauces(["samourai", "Mayo"])])]);
  assert.equal(db.library.size, 3, "Samouraï, Ketchup, Mayo");
  const ids = [...db.choices.values()].map((c) => c.library_id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids.length, 4);
});

test("une sous-question est écrite et reliée à son choix", async () => {
  const db = db0("a1");
  const frites: SaveGroup = { title: "Ajouter des frites ?", kind: "extra", min: 0, max: 1, choices: [choice("Oui", 1, [{ title: "Sauce frites", kind: "inclus", min: 0, max: 1, choices: [choice("Ketchup"), choice("Mayo")] }])] };
  const r = await save(db, [lot(["a1"], [frites])]);
  assert.equal(r.ok && r.groups, 2);
  assert.equal(db.choiceGroups.length, 1);
  const parent = db.choices.get(db.choiceGroups[0].choice_id)!;
  assert.equal(db.groups.get(parent.group_id)!.title, "Ajouter des frites ?");
  assert.equal(db.groups.get(db.choiceGroups[0].group_id)!.title, "Sauce frites");
  assert.deepEqual(db.groupTitles("a1"), ["Ajouter des frites ?"], "le sous-groupe n'est PAS rattaché à l'article : seul son choix l'ouvre");
});

test("enregistrer à nouveau remplace l'ancien réglage et nettoie les anciens groupes, sous-groupes compris", async () => {
  const db = db0("a1", "a2");
  const frites: SaveGroup = { title: "Frites ?", kind: "extra", min: 0, max: 1, choices: [choice("Oui", 1, [{ title: "Sauce frites", kind: "inclus", min: 0, max: 1, choices: [choice("Ketchup")] }])] };
  await save(db, [lot(["a1", "a2"], [sauces(), frites])]);
  assert.equal(db.groups.size, 3);
  const r = await save(db, [lot(["a1", "a2"], [supplements()])]);
  assert.equal(r.ok && r.groups, 1);
  assert.equal(db.groups.size, 1, "plus rien de l'ancien réglage : ni groupes, ni sous-groupe");
  assert.equal(db.choiceGroups.length, 0);
  assert.deepEqual(db.groupTitles("a1"), ["Suppléments"]);
  assert.deepEqual([...db.choices.values()].map((c) => c.group_id).filter((g) => !db.groups.has(g)), [], "aucun choix orphelin");
});

test("un ancien groupe encore utilisé par un autre article n'est jamais supprimé", async () => {
  const db = db0("a1", "a2");
  await save(db, [lot(["a1", "a2"], [sauces()])]);
  const shared = db.links[0].group_id;
  // On ne ré-enregistre que a1 : le groupe reste lié à a2.
  await save(db, [lot(["a1"], [supplements()])]);
  assert.ok(db.groups.has(shared), "le groupe de a2 est intact");
  assert.deepEqual(db.groupTitles("a2"), ["Sauces"]);
  assert.deepEqual(db.groupTitles("a1"), ["Suppléments"]);
});

test("un lot sans aucune liste de choix retire les options existantes", async () => {
  const db = db0("a1");
  await save(db, [lot(["a1"], [sauces()])]);
  const r = await save(db, [lot(["a1"], [])]);
  assert.equal(r.ok && r.groups, 0);
  assert.equal(db.links.length, 0);
  assert.equal(db.groups.size, 0);
});

// ─── Les pannes ──────────────────────────────────────────────────────────────

for (const step of ["insertGroups", "insertChoices", "insertChoiceGroups", "linkArticles", "unlink"]) {
  test(`si « ${step} » échoue, l'ancien réglage reste intact et rien de nouveau ne traîne`, async () => {
    const db = db0("a1");
    await save(db, [lot(["a1"], [sauces()])]);
    const before = { groups: [...db.groups.keys()].sort(), links: JSON.stringify(db.links), choices: db.choices.size };
    db.failOn = step;
    const r = await save(db, [lot(["a1"], [supplements()])]);
    assert.equal(r.ok, false);
    if (!r.ok) { assert.equal(r.status, 500); assert.match(r.error, /Rien n'a été changé/); }
    assert.deepEqual([...db.groups.keys()].sort(), before.groups);
    assert.equal(JSON.stringify(db.links), before.links);
    assert.equal(db.choices.size, before.choices);
  });
}

test("si le deuxième groupe de plats échoue, le premier reste écrit et le message le dit", async () => {
  const db = db0("a1", "a2");
  let calls = 0;
  const original = db.insertGroups.bind(db);
  db.insertGroups = async (rows) => { if (++calls === 2) throw new Error("panne"); return original(rows); };
  const r = await save(db, [lot(["a1"], [sauces()]), lot(["a2"], [supplements()])]);
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.savedLots, 1); assert.match(r.error, /après 1 groupe/); }
  assert.deepEqual(db.groupTitles("a1"), ["Sauces"]);
  assert.deepEqual(db.groupTitles("a2"), []);
});

test("un plat d'un autre établissement est refusé avant d'écrire quoi que ce soit", async () => {
  const db = db0("a1");
  const r = await save(db, [lot(["a1", "intrus"], [sauces()])]);
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 400); assert.match(r.error, /n'appartient pas/); }
  assert.equal(db.groups.size, 0);
});

test("tables absentes : l'erreur est dite clairement (503), rien n'est inventé", async () => {
  const db = db0("a1");
  db.insertGroups = async () => { throw new OptionsUnavailableError(); };
  const r = await save(db, [lot(["a1"], [sauces()])]);
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.status, 503); assert.match(r.error, /pas encore activées/); }
});

// ─── La trace ────────────────────────────────────────────────────────────────

test("la trace est écrite avec les chiffres du restaurateur, jamais ceux du navigateur pour les lots", async () => {
  const db = db0("a1", "a2");
  const r = await save(db, [lot(["a1"], [sauces()]), lot(["a2"], [supplements()])], { articles: 9, lots: 4, unplaced: 2, suggested: 3, suggestedKept: 2, added: 1, merges: 1, splits: 0, choicesProposed: 999 });
  assert.equal(r.ok && r.traceSaved, true);
  const row = db.setups[0];
  assert.equal(row.restaurant_id, "resto");
  assert.equal(row.created_by, "user-1");
  assert.equal(row.lots_saved, 2);
  assert.equal(row.articles_total, 9);
  assert.equal(row.choices_proposed, 12, "somme des lots reçus, pas le chiffre « 999 » du champ libre");
  assert.equal(row.choices_kept, 10);
  assert.equal(row.prices_set, 4);
  assert.equal(row.detail.length, 2);
});

test("sans table de trace, l'enregistrement réussit et le dit (jamais bloquant, jamais silencieux)", async () => {
  const db = db0("a1");
  db.traceTable = false;
  const r = await save(db, [lot(["a1"], [sauces()])]);
  assert.equal(r.ok && r.traceSaved, false);
  assert.equal(db.groups.size, 1);
});

test("une trace absurde est ramenée à zéro, pas enregistrée telle quelle", async () => {
  const db = db0("a1");
  await save(db, [lot(["a1"], [sauces()])], { articles: -5, lots: "beaucoup", unplaced: 1e9 });
  assert.deepEqual([db.setups[0].articles_total, db.setups[0].lots_total, db.setups[0].unplaced], [0, 0, 0]);
});

// ─── De l'éditeur au serveur ─────────────────────────────────────────────────

test("ce que produit l'éditeur passe la validation du serveur, de bout en bout", async () => {
  const arts = [
    { id: "m1", name: "Mitraillette kefta", category: "Snacks" }, { id: "m2", name: "Mitraillette poulet", category: "Snacks" },
    { id: "p1", name: "Pizza Margherita", category: "Pizzas" }, { id: "b1", name: "Coca-Cola 33 cl", category: "Boissons" },
  ];
  let s = buildEditor(arts);
  for (const l of s.lots) {
    for (const g of s.lots.find((x) => x.key === l.key)!.groups) s = applyBulkPrice(s, l.key, g.key, 1.5);
    s = validateLot(s, l.key);
  }
  assert.ok(s.lots.every((l) => l.validated));
  const db = db0("m1", "m2", "p1", "b1");
  const r = await save(db, savePayload(s));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(db.groupTitles("m1"), ["Crudités", "Sauces", "Suppléments", "Ajouter des frites ?", "Je le prends sans"]);
  assert.deepEqual(db.groupTitles("p1"), ["Taille", "Suppléments", "Je le prends sans"]);
  assert.deepEqual(db.groupTitles("b1"), [], "boissons : aucune option");
  const prices = [...db.choices.values()].map((c) => c.price_delta);
  assert.ok(prices.every((p) => Number.isFinite(p) && p >= 0));
});
