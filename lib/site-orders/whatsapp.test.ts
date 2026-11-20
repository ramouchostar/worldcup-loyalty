import assert from "node:assert/strict";
import { test } from "node:test";
import type { OptionChoice, OptionGroup } from "../menu-options/types";
import { addToCart, cartTotal, setChoiceQty, startSelection, toOrderLines, type Cart } from "./cart";
import type { PublicItem } from "./menu";
import { priceOrder, type CatalogItem } from "./order";
import {
  LABELS_FR, MAX_LINK_CHARS, buildWhatsAppText, cleanWhatsAppNumber, formatWhatsApp, isWhatsAppNumber, whatsAppChatLink, whatsAppLink,
} from "./whatsapp";

const choice = (id: string, name: string, o: Partial<OptionChoice> = {}): OptionChoice => ({ id, libraryId: `l-${id}`, name, priceDelta: 0, maxQty: 1, isDefault: false, isAvailable: true, groups: [], ...o });
const group = (id: string, title: string, kind: OptionGroup["kind"], min: number, max: number | null, choices: OptionChoice[]): OptionGroup => ({ id, title, kind, min, max, choices });

const groups: OptionGroup[] = [
  group("sauces", "Sauces", "inclus", 1, 2, [choice("ketchup", "Ketchup"), choice("samourai", "Samouraï")]),
  group("supp", "Suppléments", "extra", 0, null, [choice("fromage", "Fromage", { priceDelta: 1.5, maxQty: 3 })]),
  group("crudites", "Crudités", "inclus", 0, null, [choice("salade", "Salade", { isDefault: true })]),
];
const burger: PublicItem = { id: "burger", name: "Cheese burger", priceCents: 950, description: null, allergens: { text: "x", confirmed: false }, imageUrl: null, groups };
const cola: PublicItem = { id: "cola", name: "Cola", priceCents: 250, description: null, allergens: { text: "x", confirmed: false }, imageUrl: null, groups: [] };

function sampleCart(): Cart {
  let s = startSelection(groups);
  s = setChoiceQty(groups, s, "sauces", "samourai", 1);
  s = setChoiceQty(groups, s, "supp", "fromage", 2);
  s = setChoiceQty(groups, s, "crudites", "salade", 0); // décochée : « SANS SALADE »
  return addToCart(addToCart([], burger, s, 2), cola, {}, 1);
}

test("le message reprend tout le panier : prénom, quantités, choix, « SANS », suppléments et total", () => {
  const text = buildWhatsAppText(sampleCart(), "Amina");
  assert.match(text, /Prénom : Amina/);
  assert.match(text, /2 × Cheese burger/);
  assert.match(text, /1 × Cola/);
  assert.match(text, /Sauces : Samouraï/);
  assert.match(text, /\+ 2× FROMAGE/);
  assert.match(text, /SANS SALADE/); // jamais « SANS » seul : même règle que le ticket de cuisine
  assert.match(text, /À payer au comptoir : /);
  assert.match(text, /n'a pas été enregistrée sur le site/);
});

test("le total du message est celui que le serveur recalculerait (le panier ne ment pas)", () => {
  const cart = sampleCart();
  const catalog = new Map<string, CatalogItem>([
    ["burger", { id: "burger", name: "Cheese burger", price: 9.5, active: true, zone: null }],
    ["cola", { id: "cola", name: "Cola", price: 2.5, active: true, zone: null }],
  ]);
  const trees = new Map<string, OptionGroup[]>([["burger", groups], ["cola", []]]);
  const priced = priceOrder({ firstName: "Amina", phone: "0470123456", lines: toOrderLines(cart) }, catalog, trees);
  assert.equal(priced.ok, true);
  if (priced.ok) assert.equal(priced.totalCents, cartTotal(cart));
  const euro = (cartTotal(cart) / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
  assert.ok(buildWhatsAppText(cart, "Amina").includes(euro));
});

test("un prénom vide donne « CLIENT » et un nom de plat reste celui de la carte", () => {
  const text = buildWhatsAppText(addToCart([], cola, {}, 1), "   ");
  assert.match(text, /Prénom : CLIENT/);
  assert.match(text, /1 × Cola/);
});

test("un panier vide ne produit pas de ligne de plat", () => {
  const text = buildWhatsAppText([], "Amina");
  assert.doesNotMatch(text, /×/);
});

test("une autre langue ne change que les mots : les noms de plats restent ceux de la carte", () => {
  const nl = { ...LABELS_FR, title: "Bestelling vanaf de site", name: "Voornaam", total: "Te betalen aan de toonbank" };
  const text = buildWhatsAppText(addToCart([], cola, {}, 1), "Amina", nl);
  assert.match(text, /Voornaam : Amina/);
  assert.match(text, /1 × Cola/);
});

test("cleanWhatsAppNumber : un numéro belge, avec ou sans indicatif, devient des chiffres seuls", () => {
  assert.equal(cleanWhatsAppNumber("0470 12 34 56"), "32470123456");
  assert.equal(cleanWhatsAppNumber("+32 470 12 34 56"), "32470123456");
  assert.equal(cleanWhatsAppNumber("0032 470 12 34 56"), "32470123456");
  assert.equal(cleanWhatsAppNumber("+33 6 12 34 56 78"), "33612345678");
});

test("cleanWhatsAppNumber : l'indicatif inconnu, le vide et l'illisible sont refusés, jamais devinés", () => {
  for (const bad of ["470123456", "", "   ", "abc", "+32", "0470", "+3247012345678901234", null, undefined, 470123456]) {
    assert.equal(cleanWhatsAppNumber(bad), null, String(bad));
  }
});

test("isWhatsAppNumber : chiffres seuls, 9 à 15, sans zéro de tête", () => {
  assert.equal(isWhatsAppNumber("32470123456"), true);
  assert.equal(isWhatsAppNumber("0470123456"), false);
  assert.equal(isWhatsAppNumber("+32470123456"), false);
  assert.equal(isWhatsAppNumber("3247"), false);
});

test("formatWhatsApp : un mobile belge se lit par groupes, tout autre numéro en chiffres", () => {
  assert.equal(formatWhatsApp("32470123456"), "+32 470 12 34 56");
  assert.equal(formatWhatsApp("33612345678"), "+33612345678");
  assert.equal(formatWhatsApp("3225551234"), "+3225551234"); // un fixe bruxellois n'est pas un mobile : pas de découpage inventé
});

test("whatsAppLink : le texte est encodé, un numéro invalide ou un lien trop long ne donnent pas de lien", () => {
  const link = whatsAppLink("32470123456", "2 × Burger\nSANS SALADE");
  assert.ok(link?.startsWith("https://wa.me/32470123456?text="));
  assert.ok(link?.includes("%0A")); // le retour à la ligne survit
  assert.equal(whatsAppLink(null, "x"), null);
  assert.equal(whatsAppLink("0470123456", "x"), null);
  assert.equal(whatsAppLink("32470123456", "x".repeat(MAX_LINK_CHARS)), null);
  assert.equal(whatsAppChatLink("32470123456"), "https://wa.me/32470123456");
  assert.equal(whatsAppChatLink(null), null);
});

test("un panier de 30 lignes chargées dépasse le lien : le client copie le message, et rien n'est coupé en silence", () => {
  let s = startSelection(groups);
  s = setChoiceQty(groups, s, "sauces", "samourai", 1);
  s = setChoiceQty(groups, s, "supp", "fromage", 3);
  s = setChoiceQty(groups, s, "crudites", "salade", 0);
  let cart: Cart = [];
  for (let i = 0; i < 30; i++) cart = addToCart(cart, { ...burger, id: `b${i}`, name: `Burger numéro ${i} avec un nom assez long pour la ligne` }, s, 1);
  const text = buildWhatsAppText(cart, "Amina");
  assert.equal(whatsAppLink("32470123456", text), null);
  assert.ok(text.includes("Burger numéro 29")); // le texte, lui, est complet : c'est ce que « Copier » donne
});
