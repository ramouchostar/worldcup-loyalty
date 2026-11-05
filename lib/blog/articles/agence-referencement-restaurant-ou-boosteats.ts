import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05). Max (Google) est EN PILOTE (ADR 0070) ;
// prix des agences : relevés belges cités dans lib/comparatif.ts. Jamais le
// mot anglais du référencement dans le texte (règle du site public).
export const article: BlogArticle = {
  slug: "agence-referencement-restaurant-ou-boosteats",
  category: "Comparatifs",
  title: "Agence de référencement ou Boosteats : être trouvé sur Google Maps",
  metaTitle: "Référencement Google Maps d'un restaurant : prix",
  metaDescription:
    "Combien coûte une agence de référencement local à Bruxelles pour un restaurant ? Prix relevés, ce qui compte sur Google Maps, et ce que prépare Boosteats.",
  excerpt:
    "Une agence de référencement local demande 390 à 900 € par mois à Bruxelles. Voici ce qui fait vraiment monter un restaurant sur Google Maps, et ce que prépare Boosteats.",
  published: "2026-11-05",
  readingMinutes: 5,
  keywords: [
    "référencement google maps restaurant",
    "agence référencement bruxelles prix",
    "référencement local restaurant",
    "être premier sur google maps",
    "visibilité google restaurant",
  ],
  blocks: [
    {
      type: "p",
      text: "Quand quelqu'un cherche « burger » depuis son téléphone, Google montre trois restaurants sur une carte. Être dans ces trois-là se joue sur votre fiche Google, vos avis, votre site et la distance. Une agence de référencement travaille ces points chaque mois. Voici ce que ça coûte, et l'alternative.",
    },
    { type: "h2", id: "prix", text: "Ce que coûte une agence à Bruxelles" },
    {
      type: "p",
      text: "D'après les prix publics relevés en novembre 2026, le référencement local d'une petite entreprise à Bruxelles coûte de 390 € à 900 € HTVA par mois chez une agence, un peu moins chez un indépendant. Les offres accompagnées des plateformes pour restaurants, comme Malou Copilot, tournent autour de 550 à 600 € par mois. Comptez trois à six mois avant de voir la fiche monter.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Une agence de référencement", "Boosteats"],
      rows: [
        ["Prix", "390 à 900 € HTVA par mois", "Dans le forfait Pro (500 € HTVA par mois), avec tout le reste"],
        ["La fiche Google", "Optimisée", "Tenue à jour par notre équipe (forfait Pro, sur invitation)"],
        ["Les avis", "Parfois en plus", "Réponses faites avec vous dès le forfait Croissance"],
        ["Le site", "Optimisé s'il existe", "Créé par Nina (en pilote)"],
        ["Le suivi", "Un rapport mensuel", "Un rapport mensuel avec votre place sur Google Maps, rue par rue (en pilote)"],
      ],
    },
    { type: "h2", id: "ce-qui-compte", text: "Ce qui fait monter un restaurant sur Google Maps" },
    {
      type: "ol",
      items: [
        "Une fiche complète : catégorie juste, horaires à jour, photos récentes, carte.",
        "Des avis nombreux et récents, avec une réponse à chacun.",
        "Un site rapide sur téléphone, qui dit clairement ce que vous servez et où.",
        "De l'activité : nouvelles photos, posts, promos.",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "En pilote",
      text: "Max, l'assistant de Google, est en test avec quelques établissements dans le forfait Pro. La fiche Google tenue à jour et la réponse aux avis, elles, sont déjà en place.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Où êtes-vous sur Google Maps ?",
      text: "L'analyse gratuite montre en une minute comment votre fiche se situe face aux restaurants autour de vous, et ce qu'il faut corriger en premier.",
    },
  ],
  faq: [
    {
      q: "Combien coûte le référencement local d'un restaurant ?",
      a: "À Bruxelles, les prix relevés en novembre 2026 vont de 390 € à 900 € HTVA par mois chez une agence, un peu moins chez un indépendant.",
    },
    {
      q: "Combien de temps pour monter sur Google Maps ?",
      a: "En général trois à six mois. Les premières corrections de la fiche (catégorie, horaires, photos) se voient parfois plus vite.",
    },
  ],
  related: ["visibilite-restaurant", "analyse-fiche-google-restaurant", "blog/fiche-google-restaurant-guide", "blog/site-internet-restaurant-developpeur-ou-boosteats"],
};
