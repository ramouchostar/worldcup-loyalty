import { test } from "node:test";
import assert from "node:assert/strict";
import { cardsFor, categoryShort, fichePotential, heroFor, latestNegative } from "./report-model";
import type { FicheScore } from "./fiche-score";
import type { BusinessInfo } from "./dataforseo";

const score: FicheScore = {
  score: 60, verified: 3, total: 4, gaps: ["pas_de_lien_commande"],
  criteria: [
    { key: "note", block: "avis", label: "Note", points: 10, status: "partiel" },
    { key: "lien_commande", block: "liens", label: "Commande", points: 10, status: "manquant", gap: "pas_de_lien_commande" },
    { key: "telephone", block: "coordonnees", label: "Téléphone", points: 10, status: "ok" },
    { key: "photos_recentes", block: "photos", label: "Photos", points: 10, status: "non_verifie" },
  ],
};

test("potentiel de la fiche : les manques se comblent, la note Google non", () => {
  // note partielle (5/10) + commande comblée (10) + téléphone (10) = 25/30
  assert.equal(fichePotential(score), 83);
});

test("catégorie courte pour le titre", () => {
  assert.equal(categoryShort("Restaurant de hamburgers"), "hamburgers");
  assert.equal(categoryShort("Pizzeria"), "pizzeria");
  assert.equal(categoryShort(null), null);
});

test("titre selon la note : jamais « la référence » pour un audit faible", () => {
  const base = { name: "Krusty", commune: "Anderlecht", category: "Restaurant de hamburgers", rating: 4.9, reviews: 526, responseShare: 0.98, top: [{ title: "Ajouter un lien de commande directe" }], potential: 95, date: new Date("2026-09-24") };
  assert.match(heroFor({ ...base, now: 89 }).highlight, /meilleures adresses hamburgers à Anderlecht/);
  assert.match(heroFor({ ...base, now: 70 }).highlight, /la référence hamburgers à Anderlecht/);
  assert.match(heroFor({ ...base, now: 40 }).highlight, /confiance/);
  assert.match(heroFor({ ...base, now: 89 }).lead, /4,9★ sur 526 avis, et vous répondez à presque tous/);
});

test("fiche dans 90 jours : seuls les manques du plan s'allument", () => {
  const info = { title: "K", phone: "0497", url: "https://k.be", local_business_links: null, rating: { value: 4.9, votes_count: 526 } } as unknown as BusinessInfo;
  const { today, after } = cardsFor(info, ["pas_de_lien_commande"]);
  const st = (c: typeof today, k: string) => c.actions.find((a) => a.key === k)?.state;
  assert.equal(st(today, "commander"), "off");
  assert.equal(st(after, "commander"), "new");
  assert.equal(st(after, "menu"), "off"); // pas dans le plan : reste éteint
  assert.equal(st(after, "appeler"), "on");
});

test("dernier avis négatif : le plus récent, texte raccourci", () => {
  const r = latestNegative([
    { rating: 1, text: "Très long temps d'attente ce midi, vraiment déçu", date: "2026-05-01T00:00:00Z", ownerAnswer: null, ownerAnswerDate: null },
    { rating: 2, text: "Froid à l'arrivée, frites molles et sauce oubliée", date: "2026-08-01T00:00:00Z", ownerAnswer: "Désolé", ownerAnswerDate: null },
    { rating: 5, text: "Parfait, rien à dire vraiment top", date: "2026-09-01T00:00:00Z", ownerAnswer: null, ownerAnswerDate: null },
  ]);
  assert.deepEqual(r, { text: "Froid à l'arrivée, frites molles et sauce oubliée", answered: true });
});

test("plan face au concurrent : la récolte d'avis passe par Boosteats", async () => {
  const { withBoosteatsReviews } = await import("./report-model");
  const a = withBoosteatsReviews({
    title: "Accélérez la collecte de nouveaux avis clients",
    why: "Le concurrent totalise 774 avis contre 142 pour nous.",
    steps: ["Ajouter un QR code \"Laissez-nous un avis\" sur le ticket de caisse", "Former le personnel à demander un avis"],
  });
  assert.equal(a.boosteats, true);
  assert.match(a.steps[0], /Boosteats/);
  assert.equal(a.steps.some((x) => /QR code/.test(x)), false);
  const b = withBoosteatsReviews({ title: "Misez sur la régularité de vos burgers", why: "2 avis sur la qualité.", steps: ["Afficher la recette"] });
  assert.equal(b.boosteats, false);
  assert.deepEqual(b.steps, ["Afficher la recette"]);
});
