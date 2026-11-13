import assert from "node:assert/strict";
import { test } from "node:test";
import type { OptionChoice, OptionGroup } from "../menu-options/types";
import { buildPublicMenu, type MenuInput, type MenuRow } from "./menu";

const choice = (id: string, name: string, o: Partial<OptionChoice> = {}): OptionChoice => ({ id, libraryId: `l-${id}`, name, priceDelta: 0, maxQty: 1, isDefault: false, isAvailable: true, groups: [], ...o });
const group = (id: string, min: number, max: number | null, choices: OptionChoice[]): OptionGroup => ({ id, title: id, kind: "inclus", min, max, choices });

const row = (id: string, o: Partial<MenuRow> = {}): MenuRow => ({ id, name: `Plat ${id}`, category: "Burgers", menu_price: 9.5, is_active: true, image_path: null, ...o });

const input = (rows: MenuRow[], trees = new Map<string, OptionGroup[]>()): MenuInput => ({
  restaurant: { id: "houba", name: "Houba", logoUrl: null }, rows, trees, imageUrl: (p) => (p ? `https://img/${p}` : null), retentionDays: 30,
});

test("buildPublicMenu : prix en centimes, regroupé par catégorie, sans catégorie = « Autres plats »", () => {
  const m = buildPublicMenu(input([row("a"), row("b", { category: "Boissons", menu_price: "2.50" }), row("c", { category: " " })]));
  assert.deepEqual(m.categories.map((c) => c.name), ["Burgers", "Boissons", "Autres plats"]);
  assert.equal(m.categories[1].items[0].priceCents, 250);
  assert.equal(m.hidden, 0);
});

test("buildPublicMenu : un plat inactif, sans prix ou à prix nul n'est pas montré (compté seulement si actif)", () => {
  const m = buildPublicMenu(input([row("a", { is_active: false }), row("b", { menu_price: 0 }), row("c", { menu_price: "abc" }), row("d")]));
  assert.deepEqual(m.categories.flatMap((c) => c.items.map((i) => i.id)), ["d"]);
  assert.equal(m.hidden, 2);
});

test("buildPublicMenu : des options impossibles à satisfaire cachent le plat", () => {
  // min 2 alors qu'un seul choix de quantité 1 : le client ne pourrait jamais commander ce plat.
  const impossible = group("sauces", 2, 2, [choice("k", "Ketchup")]);
  const ok = group("sauces", 1, 1, [choice("k", "Ketchup"), choice("m", "Mayo")]);
  const m = buildPublicMenu(input([row("a"), row("b")], new Map([["a", [impossible]], ["b", [ok]]])));
  assert.deepEqual(m.categories.flatMap((c) => c.items.map((i) => i.id)), ["b"]);
  assert.equal(m.hidden, 1);
  assert.equal(m.categories[0].items[0].groups.length, 1);
});

test("buildPublicMenu : allergènes confirmés lus, sinon « demande-nous au comptoir »", () => {
  const m = buildPublicMenu(input([row("a", { allergens: ["gluten", "lait"] }), row("b", { allergens: [] }), row("c"), row("d", { allergens: ["pomme"] })]));
  const by = Object.fromEntries(m.categories[0].items.map((i) => [i.id, i.allergens]));
  assert.equal(by.a.text, "Contient : gluten, lait");
  assert.equal(by.b.confirmed, true);
  assert.equal(by.c.text, "Allergènes : demande-nous au comptoir");
  assert.equal(by.d.confirmed, true); // allergène inconnu ignoré : liste vide confirmée, jamais une valeur inventée
});

test("buildPublicMenu : description nettoyée, photo résolue, durée de conservation transmise", () => {
  const m = buildPublicMenu(input([row("a", { description: "  Un bon burger  ", image_path: "x.jpg" }), row("b", { description: "   " })]));
  const items = m.categories[0].items;
  assert.equal(items[0].description, "Un bon burger");
  assert.equal(items[0].imageUrl, "https://img/x.jpg");
  assert.equal(items[1].description, null);
  assert.equal(m.retentionDays, 30);
});

test("buildPublicMenu : rien d'interne ne sort du menu", () => {
  const m = buildPublicMenu(input([row("a")]));
  const json = JSON.stringify(m);
  for (const secret of ["cost", "kitchen", "zone", "restaurant_id"]) assert.equal(json.includes(secret), false, secret);
});
