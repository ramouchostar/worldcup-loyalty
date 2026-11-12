import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyArticle, familyStrength, joinLabels, type Family } from "./families";

const fam = (name: string, category = "") => classifyArticle({ name, category });

test("les snacks belges sont reconnus par leur nom", () => {
  assert.equal(fam("Mitraillette kefta", "Snacks"), "mitraillette");
  assert.equal(fam("Durum poulet"), "durum");
  assert.equal(fam("Dürüm mixte"), "durum");
  assert.equal(fam("Pain turc falafel"), "pain_turc");
  assert.equal(fam("Kapsalon royal"), "kapsalon");
  assert.equal(fam("Panini jambon fromage"), "panini");
  assert.equal(fam("Tacos double"), "tacos");
});

test("la mitraillette passe avant le sandwich, le burger avant le poulet", () => {
  assert.equal(fam("Mitraillette poulet"), "mitraillette");
  assert.equal(fam("Burger poulet croustillant"), "burger");
  assert.equal(fam("Poulet pané"), "poulet_frit");
});

test("pizzas, pâtes, sushis et salades", () => {
  assert.equal(fam("Pizza Margherita"), "pizza");
  assert.equal(fam("Pâtes carbonara"), "pates");
  assert.equal(fam("Spaghetti bolognaise"), "pates");
  assert.equal(fam("California roll saumon"), "sushi");
  assert.equal(fam("Salade César"), "salade");
});

test("une catégorie transversale décide, même si le nom parle d'autre chose", () => {
  assert.equal(fam("Coca-Cola 33 cl", "Boissons"), "boisson");
  assert.equal(fam("Tiramisu", "Desserts"), "dessert");
  assert.equal(fam("Samouraï", "Sauces"), "sauce");
  assert.equal(fam("Menu burger", "Menus"), "menu");
  assert.equal(fam("Burger gratuit", "1 acheté, 1 offert"), "promo");
});

test("une marque de boisson est une boisson même dans une catégorie vague", () => {
  assert.equal(fam("Fanta orange", "Les classiques"), "boisson");
  assert.equal(fam("Menu enfant"), "menu");
});

test("une catégorie de plateforme qui ne dit rien est ignorée : le nom décide", () => {
  assert.equal(fam("Pizza Royale", "Meilleures ventes"), "pizza");
  assert.equal(fam("Durum kefta", "Produits tendance"), "durum");
});

test("le nom d'un plat prime sur la catégorie « plat » ou « viande »", () => {
  assert.equal(fam("Pizza quatre fromages", "Nos plats"), "pizza");
});

test("le nom écrit en majuscules ou avec accents est reconnu", () => {
  assert.equal(fam("PIZZA 4 FROMAGES"), "pizza");
  assert.equal(fam("Pâtes POULET diabolo"), "pates");
});

test("ce qu'on ne sait pas ranger reste « autre »", () => {
  assert.equal(fam("Spécialité du chef"), "autre");
  assert.equal(fam(""), "autre");
});

test("la confiance par famille : forte pour les snacks, faible pour les pizzas, rien pour les formules", () => {
  assert.equal(familyStrength("mitraillette"), "forte");
  assert.equal(familyStrength("durum"), "forte");
  assert.equal(familyStrength("tacos"), "moyenne");
  assert.equal(familyStrength("pizza"), "faible");
  assert.equal(familyStrength("boisson"), "aucune");
  for (const f of ["menu", "promo", "autre"] as Family[]) assert.equal(familyStrength(f), null);
});

test("le libellé d'un groupe de plats se lit comme une phrase", () => {
  assert.equal(joinLabels(["durum"]), "Durums");
  assert.equal(joinLabels(["durum", "pain_turc"]), "Durums et pains turcs");
  assert.equal(joinLabels(["durum", "pain_turc", "panini"]), "Durums, pains turcs et paninis");
  assert.equal(joinLabels(["boisson", "dessert", "sauce"]), "Boissons, desserts et sauces");
});
