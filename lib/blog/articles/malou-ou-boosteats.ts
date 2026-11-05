import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : sources dans lib/comparatif.ts. Malou est
// bien plus complet sur les réseaux sociaux et les plateformes : on le dit.
// Max (Google) est en pilote chez nous (ADR 0070).
export const article: BlogArticle = {
  slug: "malou-ou-boosteats",
  category: "Comparatifs",
  title: "Malou ou Boosteats : avis Google et visibilité de votre restaurant",
  metaTitle: "Malou ou Boosteats : comparatif avis et Google",
  metaDescription:
    "Malou gère avis, réseaux sociaux et fiches en ligne des restaurants. Boosteats ajoute fidélité, relances et pub. Comparatif honnête : prix, forces, différences.",
  excerpt:
    "Malou est une référence pour la présence en ligne des restaurants : avis, réseaux sociaux, fiches. Boosteats part de vos clients au comptoir. Voici comment choisir.",
  published: "2026-11-05",
  readingMinutes: 5,
  keywords: ["malou avis", "malou prix", "alternative malou", "gestion avis google restaurant", "malou restaurant"],
  blocks: [
    {
      type: "p",
      text: "Malou est une plateforme française qui gère la présence en ligne des restaurants : fiche Google et autres annuaires, avis de plus de dix plateformes, publications sur Instagram et Facebook. Elle travaille avec plus de 2 000 restaurants. Boosteats fait aussi répondre à vos avis Google, mais son cœur est ailleurs : vos clients, ceux qui passent au comptoir.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Malou", "Boosteats"],
      rows: [
        ["Les avis", "Plus de dix plateformes, réponses suggérées", "Google, réponses faites par notre équipe avec vous (forfait Croissance)"],
        ["Les réseaux sociaux", "Publications planifiées sur Instagram, Facebook et d'autres", "Pub payante Facebook et Instagram dans le quartier"],
        ["Fiche Google et annuaires", "Mise à jour sur plus de 50 plateformes", "Fiche Google tenue à jour en forfait Pro, référencement en pilote"],
        ["Fidélité et relances", "Non", "Oui : points, cadeaux au coût réel, relances"],
        ["Le chiffre du jour", "Non", "Oui"],
        ["Prix public", "Environ 169 € HTVA par mois, offre accompagnée vers 550 à 600 €", "150 € HTVA (Croissance) ou 500 € HTVA (Pro) par mois"],
      ],
    },
    { type: "h2", id: "ce-que-malou-fait-bien", text: "Ce que Malou fait bien" },
    {
      type: "ul",
      items: [
        "Tous les avis au même endroit, de Google à TripAdvisor.",
        "La publication sur les réseaux sociaux, planifiée et depuis le téléphone.",
        "Les informations du restaurant à jour sur des dizaines de sites.",
        "Une offre accompagnée, avec un expert dédié.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "On part de vos clients : la liste des inscrits au comptoir sert à les faire revenir.",
        "Louis, l'assistant des avis, prépare la réponse, et notre équipe la publie avec vous : il vous montre sa réponse avant qu'elle parte.",
        "La pub de quartier, la fidélité et les chiffres sont dans le même forfait.",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "Ce que Boosteats ne fait pas",
      text: "Pas de publication gratuite sur vos réseaux sociaux, pas de gestion des avis TripAdvisor ou Facebook, pas de mise à jour sur les annuaires. Si votre priorité est l'image de marque en ligne sur toutes les plateformes, Malou est plus complet.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Où en sont vos avis face aux voisins ?",
      text: "L'analyse gratuite compare en une minute votre note et vos avis à ceux des restaurants autour de vous.",
    },
  ],
  faq: [
    {
      q: "Combien coûte Malou ?",
      a: "L'offre la plus citée pour un établissement est autour de 169 € HTVA par mois, et l'offre accompagnée autour de 550 à 600 €, d'après des relevés de 2026. Le prix exact se fait sur devis.",
    },
    {
      q: "Boosteats répond-il à tous mes avis Google ?",
      a: "Oui, en forfait Croissance et Pro, une fois que vous nous avez invités comme gestionnaire de votre fiche. La réponse vous est montrée avant d'être publiée.",
    },
  ],
  related: ["blog/guest-suite-ou-boosteats", "analyse-avis-google-restaurant", "blog/repondre-avis-google-restaurant", "blog/agence-referencement-restaurant-ou-boosteats"],
};
