import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : sources dans lib/comparatif.ts.
export const article: BlogArticle = {
  slug: "guest-suite-ou-boosteats",
  category: "Comparatifs",
  title: "Guest Suite ou Boosteats : récolter et répondre aux avis de votre restaurant",
  metaTitle: "Guest Suite ou Boosteats : avis clients restaurant",
  metaDescription:
    "Guest Suite collecte des avis par enquête. Boosteats répond à vos avis Google et fait revenir vos clients. Comparatif honnête : prix, forces et différences.",
  excerpt:
    "Guest Suite est spécialisé dans la collecte d'avis par enquête de satisfaction. Boosteats répond à vos avis Google et s'occupe de faire revenir vos clients. Ce qui les distingue.",
  published: "2026-11-05",
  readingMinutes: 4,
  keywords: ["guest suite avis", "guest suite prix", "collecter avis google restaurant", "enquête satisfaction restaurant", "alternative guest suite"],
  blocks: [
    {
      type: "p",
      text: "Guest Suite est un outil français de collecte d'avis : après la visite, le client reçoit une enquête par e-mail, SMS ou QR code, et son avis peut être publié sur Google. Boosteats ne fait pas d'enquête : il répond aux avis Google que vous recevez, et fait revenir vos clients.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Guest Suite", "Boosteats"],
      rows: [
        ["Récolter de nouveaux avis", "Oui, par enquête après la visite", "Non"],
        ["Répondre aux avis", "Depuis l'outil, sur certaines plateformes", "Sur Google, par notre équipe avec vous"],
        ["Mesurer la satisfaction", "Oui, enquêtes et indicateurs", "Non"],
        ["Fidélité, relances, pub", "Non", "Oui"],
        ["Prix public", "39 à 49 € HTVA par mois pour un établissement", "Avis Google dans le forfait Croissance (150 € HTVA par mois)"],
      ],
    },
    { type: "h2", id: "ce-que-guest-suite-fait-bien", text: "Ce que Guest Suite fait bien" },
    {
      type: "ul",
      items: [
        "Faire monter le nombre d'avis, en demandant à chaque client.",
        "Des enquêtes de satisfaction détaillées, pour savoir ce qui cloche.",
        "Une certification de la gestion des avis.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "Vous n'écrivez plus les réponses : Louis les prépare, notre équipe les publie avec vous.",
        "Vos clients inscrits deviennent une liste à relancer, avec des cadeaux dont vous connaissez le coût.",
        "La pub de quartier et le suivi du chiffre sont au même endroit.",
      ],
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Quand choisir Guest Suite",
      text: "Si votre problème est d'avoir trop peu d'avis, Guest Suite est fait pour ça. Si vous avez des avis mais pas le temps d'y répondre, et que vous voulez surtout plus de clients qui reviennent, Boosteats couvre plus de besoins.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Vos avis face aux restaurants d'à côté",
      text: "L'analyse gratuite montre en une minute votre note, vos avis et ceux de vos voisins.",
    },
  ],
  faq: [
    {
      q: "Combien coûte Guest Suite ?",
      a: "Un comparateur indique 39 € à 49 € HTVA par mois pour un établissement, relevé en novembre 2026. Vérifiez le prix du jour auprès de l'éditeur.",
    },
    {
      q: "Peut-on demander des avis à ses clients avec Boosteats ?",
      a: "Pas encore par une enquête. Vous pouvez en revanche écrire à vos clients inscrits, et nous répondons aux avis que vous recevez.",
    },
  ],
  related: ["blog/malou-ou-boosteats", "blog/repondre-avis-google-restaurant", "analyse-avis-google-restaurant", "blog/combien-coute-le-marketing-d-un-restaurant"],
};
