import assert from "node:assert/strict";
import { test } from "node:test";
import type { OptionChoice, OptionGroup } from "../menu-options/types";
import {
  brusselsDay, canTransition, checkRequest, cleanPhone, formatNumber, isOpen, minutesToReady, nextStatuses, priceOrder, readLines,
  siteOrdersEnabledFor, toTicketLines, MAX_QTY, MAX_TOTAL_CENTS, type CatalogItem, type OrderRequest,
} from "./order";

const choice = (id: string, name: string, o: Partial<OptionChoice> = {}): OptionChoice => ({
  id, libraryId: `lib-${id}`, name, priceDelta: 0, maxQty: 1, isDefault: false, isAvailable: true, groups: [], ...o,
});
const group = (id: string, title: string, kind: OptionGroup["kind"], min: number, max: number | null, choices: OptionChoice[]): OptionGroup => ({ id, title, kind, min, max, choices });

const burgerTree: OptionGroup[] = [
  group("sauces", "Sauces", "inclus", 1, 2, [choice("ketchup", "Ketchup"), choice("samourai", "Samouraï")]),
  group("supp", "Suppléments", "extra", 0, 2, [choice("fromage", "Fromage", { priceDelta: 1.5, maxQty: 2 })]),
  group("crudites", "Crudités", "inclus", 0, null, [choice("salade", "Salade", { isDefault: true })]),
];

const items = new Map<string, CatalogItem>([
  ["burger", { id: "burger", name: "Cheese burger", price: 9.5, active: true, zone: "Grill" }],
  ["cola", { id: "cola", name: "Coca-Cola", price: 2.5, active: true, zone: " Comptoir " }],
  ["old", { id: "old", name: "Vieux plat", price: 5, active: false, zone: null }],
]);
const trees = new Map<string, OptionGroup[]>([["burger", burgerTree]]);

const req = (lines: OrderRequest["lines"]): OrderRequest => ({ firstName: "Amina", phone: "0470123456", lines });

test("siteOrdersEnabledFor : fermé par défaut, ouvert par liste ou *", () => {
  assert.equal(siteOrdersEnabledFor("houba", undefined), false);
  assert.equal(siteOrdersEnabledFor("houba", ""), false);
  assert.equal(siteOrdersEnabledFor("houba", "de-bue, houba"), true);
  assert.equal(siteOrdersEnabledFor("kraainem", "de-bue,houba"), false);
  assert.equal(siteOrdersEnabledFor("kraainem", "*"), true);
});

test("cleanPhone : chiffres seulement, + gardé, 8 à 15 chiffres", () => {
  assert.equal(cleanPhone("0470 12 34 56"), "0470123456");
  assert.equal(cleanPhone("+32 470 12 34 56"), "+32470123456");
  assert.equal(cleanPhone("1234567"), null);
  assert.equal(cleanPhone("1".repeat(16)), null);
  assert.equal(cleanPhone(470123456), null);
  assert.equal(cleanPhone("<script>"), null);
});

test("checkRequest : prénom, téléphone, lignes, quantités", () => {
  const ok = checkRequest({ firstName: "  Amina  B. ", phone: "0470 12 34 56", lines: [{ articleId: "cola", qty: 2 }] });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.request.firstName, "Amina B.");
    assert.deepEqual(ok.request.lines[0].selection, {});
  }
  const code = (raw: unknown) => { const r = checkRequest(raw); return r.ok ? "ok" : r.code; };
  assert.equal(code(null), "forme");
  assert.equal(code({ firstName: "  ", phone: "0470123456", lines: [{ articleId: "a", qty: 1 }] }), "prenom");
  assert.equal(code({ firstName: "<>", phone: "0470123456", lines: [{ articleId: "a", qty: 1 }] }), "prenom");
  assert.equal(code({ firstName: "A", phone: "12", lines: [{ articleId: "a", qty: 1 }] }), "telephone");
  assert.equal(code({ firstName: "A", phone: "0470123456", lines: [] }), "forme");
  assert.equal(code({ firstName: "A", phone: "0470123456", lines: [{ articleId: "a", qty: 0 }] }), "quantite");
  assert.equal(code({ firstName: "A", phone: "0470123456", lines: [{ articleId: "a", qty: 1.5 }] }), "quantite");
  assert.equal(code({ firstName: "A", phone: "0470123456", lines: [{ articleId: "a", qty: MAX_QTY + 1 }] }), "quantite");
  assert.equal(code({ firstName: "A", phone: "0470123456", lines: [{ articleId: "", qty: 1 }] }), "forme");
  assert.equal(code({ firstName: "A", phone: "0470123456", lines: [{ articleId: "a", qty: 1, selection: [] }] }), "forme");
  assert.equal(code({ firstName: "A", phone: "0470123456", lines: Array.from({ length: 31 }, () => ({ articleId: "a", qty: 1 })) }), "trop_de_lignes");
});

test("checkRequest : un prix ou un nom envoyé par le navigateur est ignoré", () => {
  const r = checkRequest({ firstName: "A", phone: "0470123456", lines: [{ articleId: "cola", qty: 1, price: 0.01, name: "Gratuit", cents: 1 }] });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(Object.keys(r.request.lines[0]).sort(), ["articleId", "qty", "selection"]);
});

test("priceOrder : le prix vient du catalogue et des choix, jamais du client", () => {
  const p = priceOrder(req([{ articleId: "burger", qty: 2, selection: { sauces: { ketchup: 1 }, supp: { fromage: 2 }, crudites: { salade: 1 } } }, { articleId: "cola", qty: 1, selection: {} }]), items, trees);
  assert.ok(p.ok);
  if (p.ok) {
    // burger : 9,50 + 2 × 1,50 = 12,50 € l'unité, × 2 = 25 € ; cola 2,50 €
    assert.equal(p.lines[0].cents, 2500);
    assert.equal(p.lines[1].cents, 250);
    assert.equal(p.totalCents, 2750);
    assert.equal(p.lines[1].zone, "Comptoir");
    assert.equal(p.lines[0].name, "Cheese burger");
  }
});

test("priceOrder : choix manquant, inconnu ou en trop refusé ; plat sans option n'accepte aucun choix", () => {
  const code = (lines: OrderRequest["lines"]) => { const p = priceOrder(req(lines), items, trees); return p.ok ? "ok" : p.code; };
  assert.equal(code([{ articleId: "burger", qty: 1, selection: {} }]), "choix_invalide"); // sauce obligatoire
  assert.equal(code([{ articleId: "burger", qty: 1, selection: { sauces: { inconnue: 1 } } }]), "choix_invalide");
  assert.equal(code([{ articleId: "burger", qty: 1, selection: { sauces: { ketchup: 1, samourai: 1 }, supp: { fromage: 3 } } }]), "choix_invalide");
  assert.equal(code([{ articleId: "cola", qty: 1, selection: { fantome: { x: 1 } } }]), "choix_invalide");
  assert.equal(code([{ articleId: "burger", qty: 1, selection: { sauces: { ketchup: 1 }, crudites: { salade: 1 } } }]), "ok");
});

test("priceOrder : plat inconnu ou plus proposé refuse toute la commande", () => {
  const code = (id: string) => { const p = priceOrder(req([{ articleId: "cola", qty: 1, selection: {} }, { articleId: id, qty: 1, selection: {} }]), items, trees); return p.ok ? "ok" : p.code; };
  assert.equal(code("fantome"), "plat_inconnu");
  assert.equal(code("old"), "plat_indisponible");
});

test("priceOrder : plafond de la commande", () => {
  const big = new Map(items);
  big.set("cher", { id: "cher", name: "Plateau", price: 300, active: true, zone: null });
  const p = priceOrder(req([{ articleId: "cher", qty: 2, selection: {} }]), big, trees);
  assert.equal(p.ok, false);
  if (!p.ok) assert.equal(p.code, "plafond");
  assert.ok(MAX_TOTAL_CENTS === 50_000);
});

test("priceOrder : lignes lisibles (SANS SALADE quand la case cochée d'office est décochée)", () => {
  const p = priceOrder(req([{ articleId: "burger", qty: 1, selection: { sauces: { samourai: 1 } } }]), items, trees);
  assert.ok(p.ok);
  if (p.ok) {
    const kinds = p.lines[0].details.map((d) => `${d.kind}:${d.name}`);
    assert.deepEqual(kinds, ["inclus:Samouraï", "sans:Salade"]);
    const t = toTicketLines(p.lines);
    assert.equal(t[0].zone, "Grill");
  }
});

test("readLines : une ligne abîmée est ignorée, jamais fatale", () => {
  const lines = readLines([{ name: "A", qty: 2, cents: 100, zone: "Grill", details: [{ kind: "sans", group: "g", name: "Salade", qty: 1, cents: 0 }, { x: 1 }] }, null, { qty: 1 }, { name: "B", qty: -3, cents: -9 }]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].details.length, 1);
  assert.equal(lines[1].qty, 1);
  assert.equal(lines[1].cents, 0);
  assert.deepEqual(readLines("x"), []);
});

test("états : recue → prete → retiree, annulation possible tant qu'elle n'est pas retirée", () => {
  assert.deepEqual(nextStatuses("recue"), ["prete", "annulee"]);
  assert.deepEqual(nextStatuses("prete"), ["retiree", "annulee"]);
  assert.deepEqual(nextStatuses("retiree"), []);
  assert.deepEqual(nextStatuses("annulee"), []);
  assert.equal(canTransition("recue", "retiree"), false);
  assert.equal(canTransition("retiree", "annulee"), false);
  assert.equal(isOpen("recue") && isOpen("prete") && !isOpen("retiree") && !isOpen("annulee"), true);
});

test("numéro et délai", () => {
  assert.equal(formatNumber(147), "0147");
  assert.equal(formatNumber(7), "0007");
  assert.equal(minutesToReady("2026-11-13T12:00:00Z", "2026-11-13T12:14:31Z"), 15);
  assert.equal(minutesToReady("2026-11-13T12:00:00Z", null), null);
  assert.equal(minutesToReady("2026-11-13T12:00:00Z", "2026-11-13T11:00:00Z"), null);
});

test("brusselsDay : la date de Bruxelles, pas celle d'UTC", () => {
  assert.equal(brusselsDay(new Date("2026-11-13T23:30:00Z")), "2026-11-14");
  assert.equal(brusselsDay(new Date("2026-11-13T10:00:00Z")), "2026-11-13");
});
