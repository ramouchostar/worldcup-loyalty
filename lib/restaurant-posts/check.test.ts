import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPublication, checkText } from "./check";
import type { PostContent } from "./types";

const codes = (text: string) => checkText(text, 0).map((i) => i.code);
const DISH = "33333333-3333-4333-8333-333333333333";

const refused = (code: string, texts: string[]) => {
  for (const t of texts) assert.ok(codes(t).includes(code as never), `${code} attendu pour « ${t} » : ${codes(t).join(", ") || "rien"}`);
};

test("un prix écrit dans le texte est refusé", () => {
  refused("prix", ["Le menu à 9,90 €.", "Seulement 12€ ce midi", "€ 8 le burger", "9.90 EUR", "dix euros pièce", "Un euro de plus", "Menu pour 7,50 ce soir", "Nos tacos à 8,00 !", "5€50", "x,xx € le plat"]);
});

test("lien, e-mail et téléphone sont refusés, chacun pour son motif", () => {
  refused("lien", ["Voir www.chez-nous.be", "https://exemple.org/menu", "Suis-nous sur instagram.com/resto", "Écris sur wa.me/32470000000", "Notre site : monresto.be"]);
  refused("email", ["Écris à contact@resto.be", "info.resto@gmail.com"]);
  assert.deepEqual(codes("contact@resto.be"), ["email"]); // pas aussi un lien
  refused("telephone", ["Appelle le 02 123 45 67", "0470/12.34.56", "+32 470 12 34 56", "0032470123456", "Tél. (02) 123-45-67", "0470/12.11.26", "02.123.45.67", "0470.12.34.56", "Le 01.12.2026 appelle le 0470 12 34 56"]);
});

test("un champ [à remplir] bloque", () => {
  const [issue] = checkText("La fête a lieu le [date de l'événement].", 0);
  assert.equal(issue.code, "champ_a_remplir");
  assert.equal(issue.message, "Il reste un champ à remplir : [date de l'événement].");
});

test("promesses sur les allergènes", () => {
  refused("allergene", [
    "Notre pain est sans gluten", "SANS LACTOSE", "Dessert sans œufs", "sans oeuf", "Sauce sans fruits à coque", "Gluten free !",
    "Ne contient pas de lait", "ne contient aucune trace d'arachide", "Convient aux allergiques", "Idéal pour les cœliaques", "0% gluten", "Aucun allergène", "sans-gluten",
  ]);
  assert.match(checkText("Notre pain est sans gluten.", 0)[0].message, /« sans gluten » est une promesse sur les allergènes/);
  assert.deepEqual(codes("sans lait"), ["allergene"]);
});

test("promesses de santé", () => {
  refused("sante", [
    "Bon pour la santé", "bon pour ta santé", "Notre menu minceur", "Pour maigrir sans effort", "Une aide à la perte de poids", "Jus détox", "Idéal pendant un régime",
    "Un plat sain", "Des recettes saines", "Riche en protéines", "Version allégée", "Sans sucres ajoutés", "Les bienfaits du gingembre", "Notre bowl santé", "Contre le cholestérol",
  ]);
});

test("le texte ordinaire d'un restaurant passe", () => {
  for (const t of [
    "Nous ouvrons dès 11h30 jusqu'à 22h00.", "Du 01.12.2026 au 15.12.2026, venez goûter.", "Le 01/12/2026.", "Depuis 2019 à Saint-Gilles.", "Un burger sans oignons si tu veux.",
    "Une pâte de 250 g, cuite 12 minutes.", "Prends 2 ou 3 sauces.", "À 5 minutes de la gare.", "Une œuvre de notre chef.", "Pour 1,50 m de longueur.", "Venez à 12.30 !",
    "L'Euro 2028 se regarde chez nous.", "Fait maison.Chaque matin.", "Notre équipe est ravie : 100 % de bonne humeur !", "Pas besoin de réserver. Santé !", "Un service soigné.",
    "Les allées du marché sont à côté.", "J'adore <3 ce plat", "Ouvert 09.00 - 22.00 / 12.00 - 23.00", "Ouvert 11.00-22.00 le week-end", "De 09:00 à 14:00 puis 17:00 - 22:00",
  ]) assert.deepEqual(codes(t), [], `« ${t} » ne devrait rien signaler : ${checkText(t, 0).map((i) => i.message).join(" ")}`);
});

test("du code HTML est refusé", () => {
  refused("html", ["<b>Nouveau</b>", "<script>alert(1)</script>", "a<br/>b", "Frites &amp; sauce"]);
});

const ok: PostContent = { title: "Nouveau menu", blocks: [{ type: "p", text: "Il arrive lundi." }, { type: "dish", itemId: DISH }] };
const dishes = new Set([DISH]);

test("un article complet passe ; les manques sont dits", () => {
  assert.deepEqual(checkPublication(ok, dishes), []);
  assert.deepEqual(checkPublication({ title: "", blocks: [] }, dishes).map((i) => i.code), ["titre_manquant", "article_vide"]);
  assert.deepEqual(checkPublication({ title: "t", blocks: [{ type: "p", text: "" }] }, dishes).map((i) => i.code), ["bloc_vide"]);
  assert.deepEqual(checkPublication({ title: "t", blocks: [{ type: "photo", path: "x", alt: "" }] }, dishes).map((i) => i.code), ["photo_sans_description"]);
  assert.deepEqual(checkPublication({ title: "t", blocks: [{ type: "dish", itemId: "" }] }, dishes).map((i) => i.code), ["plat_non_choisi"]);
});

test("un plat absent de la carte, ou une carte illisible, bloquent", () => {
  assert.deepEqual(checkPublication(ok, new Set()).map((i) => i.code), ["plat_absent"]);
  assert.deepEqual(checkPublication(ok, null).map((i) => i.code), ["carte_illisible"]);
});

test("le titre, les listes et la description d'une photo sont contrôlés aussi, une phrase dite une seule fois", () => {
  const issues = checkPublication(
    { title: "Menu à 9,90 €", blocks: [{ type: "ul", items: ["sans gluten", "sans gluten"] }, { type: "photo", path: "x", alt: "Appelle le 0470 12 34 56" }, { type: "h2", text: "Minceur" }] },
    dishes,
  );
  assert.deepEqual(issues.map((i) => [i.code, i.block]), [["prix", null], ["allergene", 0], ["telephone", 1], ["sante", 2]]);
});
