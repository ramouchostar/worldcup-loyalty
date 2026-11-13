import assert from "node:assert/strict";
import { test } from "node:test";
import { allergenText, buildPreview, checklist, siteDescription, type FactsById, type ItemFacts, type PreviewInput } from "./site-preview";

const facts = (o: Partial<ItemFacts> = {}): ItemFacts => ({ description: null, descriptionSource: null, allergens: null, ...o });

test("allergenText : jamais « aucun » sans confirmation", () => {
  assert.deepEqual(allergenText(null), { text: "Allergènes : demande-nous au comptoir", confirmed: false });
  assert.deepEqual(allergenText(undefined), { text: "Allergènes : demande-nous au comptoir", confirmed: false });
  assert.equal(allergenText([]).confirmed, true);
  assert.match(allergenText([]).text, /Aucun/);
  assert.deepEqual(allergenText(["gluten", "coque"]), { text: "Contient : gluten, fruits à coque", confirmed: true });
});

test("siteDescription : ce que le restaurateur a écrit ou repris du PDF gagne toujours", () => {
  assert.equal(siteDescription({ text: "La nôtre" }, true, facts({ description: "La sienne", descriptionSource: "restaurateur" })), "La sienne");
  assert.equal(siteDescription({ text: "La nôtre" }, true, facts({ description: "Du PDF", descriptionSource: "pdf" })), "Du PDF");
});

test("siteDescription : la nôtre seulement pour un groupe validé, sinon ce qui est déjà enregistré", () => {
  assert.equal(siteDescription({ text: "La nôtre" }, true, facts({ description: "Ancienne", descriptionSource: "generated" })), "La nôtre");
  assert.equal(siteDescription({ text: "La nôtre" }, false, facts({ description: "Ancienne", descriptionSource: "generated" })), "Ancienne");
  assert.equal(siteDescription({ text: "La nôtre" }, false, undefined), null);
  assert.equal(siteDescription(null, true, undefined), null);
  assert.equal(siteDescription({ text: "   " }, true, undefined), null);
});

const input = (o: Partial<PreviewInput> = {}): PreviewInput => ({
  articles: [
    { id: "a", name: "Cheese burger", category: "Burgers", family: "burger" },
    { id: "b", name: "Coca-Cola", category: "Boissons", family: "boisson" },
    { id: "c", name: "Mitraillette poulet", category: "", family: "mitraillette" },
  ],
  price: (id) => ({ a: 9.5, b: 2.5, c: 8 })[id] ?? 0,
  hasPhoto: (id) => id === "a",
  lotOf: (id) => (id === "a" ? { validated: true, groups: 3 } : id === "c" ? { validated: false, groups: 5 } : null),
  editorDescription: (id) => (id === "a" ? { text: "Un burger." } : null),
  configured: {},
  facts: {},
  ...o,
});

test("buildPreview : regroupé par catégorie, sans catégorie = « Autres plats »", () => {
  const cats = buildPreview(input());
  assert.deepEqual(cats.map((c) => c.name), ["Burgers", "Boissons", "Autres plats"]);
});

test("buildPreview : choix d'un groupe validé affichés, groupe non validé non enregistré = en attente", () => {
  const items = buildPreview(input()).flatMap((c) => c.items);
  const a = items.find((i) => i.id === "a")!;
  const c = items.find((i) => i.id === "c")!;
  assert.equal(a.optionGroups, 3);
  assert.equal(a.pending, false);
  assert.equal(c.optionGroups, 0);
  assert.equal(c.pending, true);
  assert.equal(a.description, "Un burger.");
});

test("buildPreview : un groupe sans aucun choix n'attend rien (une boisson)", () => {
  const b = buildPreview(input({ lotOf: () => ({ validated: false, groups: 0 }) })).flatMap((x) => x.items);
  assert.ok(b.every((i) => !i.pending));
});

test("buildPreview : un plat dont les choix sont déjà enregistrés n'est pas en attente", () => {
  const c = buildPreview(input({ configured: { c: 4 } })).flatMap((x) => x.items).find((i) => i.id === "c")!;
  assert.equal(c.optionGroups, 4);
  assert.equal(c.pending, false);
});

test("buildPreview : allergènes confirmés lus en base, les autres « demande-nous au comptoir »", () => {
  const f: FactsById = { a: facts({ allergens: ["gluten"] }) };
  const items = buildPreview(input({ facts: f })).flatMap((c) => c.items);
  assert.equal(items.find((i) => i.id === "a")!.allergens.confirmed, true);
  assert.equal(items.find((i) => i.id === "c")!.allergens.text, "Allergènes : demande-nous au comptoir");
});

test("checklist : compte photos, groupes, descriptions, allergènes confirmés (boissons exclues)", () => {
  const items = buildPreview(input({ facts: { a: facts({ allergens: ["gluten"] }) } })).flatMap((c) => c.items);
  const c = checklist({ articles: input().articles, items, lotsValidated: 1, lotsTotal: 2 });
  const by = Object.fromEntries(c.map((x) => [x.key, x]));
  assert.equal(by.plats.ok, true);
  assert.equal(by.photos.text, "1 sur 3. Les autres s'affichent sans photo.");
  assert.equal(by.choix.ok, false);
  assert.equal(by.descriptions.text, "1 sur 3.");
  assert.equal(by.allergenes.text, "1 confirmés sur 2. Les autres s'affichent « demande-nous au comptoir ».");
  assert.equal(by.allergenes.ok, false);
});

test("checklist : tout est prêt quand tout est confirmé", () => {
  const arts = [{ id: "a", name: "A", category: "X", family: "burger" as const }];
  const items = buildPreview({
    articles: arts, price: () => 1, hasPhoto: () => true, lotOf: () => ({ validated: true, groups: 1 }),
    editorDescription: () => ({ text: "d" }), configured: {}, facts: { a: facts({ allergens: [] }) },
  }).flatMap((c) => c.items);
  const c = checklist({ articles: arts, items, lotsValidated: 1, lotsTotal: 1 });
  assert.ok(c.every((x) => x.ok));
});

test("checklist : menu vide = rien n'est « prêt »", () => {
  const c = checklist({ articles: [], items: [], lotsValidated: 0, lotsTotal: 0 });
  assert.ok(c.every((x) => !x.ok));
});
