import assert from "node:assert/strict";
import { test } from "node:test";
import type { SelectionLine } from "./types";
import { buildTickets, cleanFirstName, cleanZone, distinctZones, sampleSelection, suggestZone, suggestZones, textOf, type TicketLine, type TicketOrder } from "./tickets";

const sel = (kind: SelectionLine["kind"], group: string, name: string, qty = 1): SelectionLine => ({ kind, group, name, qty, cents: 0 });
const line = (name: string, zone: string | null, cents: number, details: SelectionLine[] = [], qty = 1): TicketLine => ({ name, qty, zone, cents, details });
const order = (lines: TicketLine[], firstName = "Amina B."): TicketOrder => ({ number: "0147", firstName, pickup: "12:40", lines });

const burger = line("Cheese burger", "Grill", 1050, [sel("inclus", "Sauces", "Samouraï"), sel("inclus", "Sauces", "Ketchup"), sel("extra", "Suppléments", "Fromage", 2), sel("sans", "Crudités", "Salade")]);
const pizza = line("Pizza Margherita", "Pizza", 1100);
const pates = line("Pâtes pesto", "Pâtes", 1300);

test("cleanZone : espaces repliés, balises et commandes retirées, 30 lettres, vide = pas de coin", () => {
  assert.equal(cleanZone("  Pizza   four "), "Pizza four");
  assert.equal(cleanZone("<b>Grill</b>"), "bGrill/b");
  assert.equal(cleanZone("   "), null);
  assert.equal(cleanZone(12), null);
  assert.equal(cleanZone("x".repeat(50))?.length, 30);
  assert.equal(cleanZone("Gr\u0007ill"), "Grill");
});

test("suggestZone : une proposition par famille, rien pour une famille inconnue", () => {
  assert.equal(suggestZone("pizza"), "Pizza");
  assert.equal(suggestZone("pates"), "Pâtes");
  assert.equal(suggestZone("mitraillette"), "Grill");
  assert.equal(suggestZone("boisson"), "Comptoir");
  assert.equal(suggestZone("menu"), null);
  assert.deepEqual(suggestZones({ a: "pizza", b: "autre" }), { a: "Pizza", b: null });
});

test("distinctZones : ordre d'apparition, sans doublon ni vide", () => {
  assert.deepEqual(distinctZones(["Pizza", null, "Grill", "Pizza"]), ["Pizza", "Grill"]);
});

test("cleanFirstName : « CLIENT » à défaut, balises retirées, 24 lettres", () => {
  assert.equal(cleanFirstName("  Amina   B. "), "Amina B.");
  assert.equal(cleanFirstName(""), "CLIENT");
  assert.equal(cleanFirstName(undefined), "CLIENT");
  assert.equal(cleanFirstName("<script>"), "script");
  assert.equal(cleanFirstName("x".repeat(40)).length, 24);
});

test("textOf : « SANS SALADE » en entier, jamais « SANS » seul ; sauces regroupées ; suppléments avec quantité", () => {
  const t = textOf(burger);
  assert.equal(t.name, "CHEESE BURGER");
  assert.deepEqual(t.without, ["SANS SALADE"]);
  assert.deepEqual(t.details, ["Sauces : Samouraï, Ketchup", "+ 2× FROMAGE"]);
  assert.ok(t.without.every((w) => w.length > "SANS ".length));
  assert.deepEqual(textOf(line("X", null, 0, [sel("sans", "g", "  ")])).without, []);
});

test("textOf : un supplément « Oui » s'écrit avec ce qu'on ajoute, jamais « + OUI »", () => {
  assert.deepEqual(textOf(line("Mitraillette", null, 0, [sel("extra", "Ajouter des frites ?", "Oui")])).details, ["+ FRITES"]);
  assert.deepEqual(textOf(line("X", null, 0, [sel("extra", "Une boisson ?", "oui")])).details, ["+ BOISSON"]);
  assert.deepEqual(textOf(line("X", null, 0, [sel("extra", "Ajouter ?", "Oui")])).details, ["+ OUI"]); // rien à en tirer : on garde le nom
  assert.deepEqual(textOf(line("X", null, 0, [sel("extra", "Suppléments", "Feta")])).details, ["+ FETA"]);
});

test("textOf : une quantité de choix s'écrit ×n, une quantité de ligne est au moins 1", () => {
  const t = textOf(line("Durum", null, 0, [sel("inclus", "Sauces", "Samouraï", 2)], 0));
  assert.deepEqual(t.details, ["Sauces : Samouraï ×2"]);
  assert.equal(t.qty, 1);
});

test("sans découpage : un seul ticket CUISINE, avec la somme à payer et le prénom", () => {
  const [t, ...rest] = buildTickets(order([burger, pizza]), { split: false, cashier: true });
  assert.equal(rest.length, 0);
  assert.equal(t.title, "CUISINE");
  assert.equal(t.totalCents, 2150);
  assert.equal(t.firstName, "Amina B.");
  assert.equal(t.meta, "N° 0147 · retrait 12:40");
  assert.equal(t.lines.length, 2);
});

test("avec découpage : un ticket par coin, sans prix, prénom sur chacun, numérotés", () => {
  const ts = buildTickets(order([burger, pizza, pates]), { split: true, cashier: false });
  assert.deepEqual(ts.map((t) => t.title), ["TICKET 1/3 · GRILL", "TICKET 2/3 · PIZZA", "TICKET 3/3 · PÂTES"]);
  assert.ok(ts.every((t) => t.totalCents === null && t.firstName === "Amina B."));
  assert.deepEqual(ts[1].lines.map((l) => l.name), ["PIZZA MARGHERITA"]);
});

test("avec découpage et caisse : un ticket de plus, tout dedans, avec la somme", () => {
  const ts = buildTickets(order([burger, pizza, pates]), { split: true, cashier: true });
  const caisse = ts[ts.length - 1];
  assert.equal(caisse.title, "CAISSE · TOUT");
  assert.equal(caisse.lines.length, 3);
  assert.equal(caisse.totalCents, 3450);
  assert.equal(ts.length, 4);
});

test("un plat sans coin va au ticket CUISINE : jamais perdu", () => {
  const ts = buildTickets(order([pizza, line("Plat libre", null, 500)]), { split: true, cashier: false });
  assert.deepEqual(ts.map((t) => t.title), ["TICKET 1/2 · PIZZA", "TICKET 2/2 · CUISINE"]);
  const names = ts.flatMap((t) => t.lines.map((l) => l.name));
  assert.deepEqual(names.sort(), ["PIZZA MARGHERITA", "PLAT LIBRE"]);
});

test("plus de coins que la limite : les plats du reste ne disparaissent pas", () => {
  const many = Array.from({ length: 11 }, (_, i) => line(`Plat ${i}`, `Coin ${i}`, 100));
  const ts = buildTickets(order(many), { split: true, cashier: false });
  assert.equal(ts.length, 8);
  assert.equal(ts.flatMap((t) => t.lines).length, 11);
});

test("commande vide : aucun ticket", () => {
  assert.deepEqual(buildTickets(order([]), { split: true, cashier: true }), []);
});

test("le prénom est nettoyé sur chaque ticket, numéro et heure aussi", () => {
  const [t] = buildTickets({ number: "<1>", firstName: "<i>Léa</i>", pickup: "", lines: [pizza] }, { split: false, cashier: false });
  assert.equal(t.firstName, "iLéa/i");
  assert.equal(t.meta, "N° 1");
});

test("prix négatif ou fractionnaire : la somme reste un entier positif", () => {
  const [t] = buildTickets(order([line("A", null, -50), line("B", null, 99.6)]), { split: false, cashier: false });
  assert.equal(t.totalCents, 100);
});

test("sampleSelection : un « sans », un choix, un supplément, jamais un choix décoché", () => {
  const out = sampleSelection([
    { title: "Crudités", kind: "inclus", choices: [{ name: "Salade", isDefault: true, keep: true }, { name: "Tomate", isDefault: true, keep: true }] },
    { title: "Sauces", kind: "inclus", choices: [{ name: "Ketchup", isDefault: false, keep: false }, { name: "Samouraï", isDefault: false, keep: true }] },
    { title: "Suppléments", kind: "extra", choices: [{ name: "Feta", isDefault: false, keep: true }] },
    { title: "Je le prends sans", kind: "retrait", choices: [{ name: "Oignons", isDefault: false, keep: true }] },
  ]);
  assert.deepEqual(out.map((l) => `${l.kind}:${l.name}`), ["sans:Salade", "inclus:Samouraï", "extra:Feta"]);
});

test("sampleSelection : un groupe vide ou sans nom ne donne rien", () => {
  assert.deepEqual(sampleSelection([{ title: "X", kind: "inclus", choices: [{ name: "  ", isDefault: false, keep: true }, { name: "A", isDefault: false, keep: false }] }]), []);
});
