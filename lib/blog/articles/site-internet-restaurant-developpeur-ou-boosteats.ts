import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05). Nina est EN PILOTE (ADR 0070) et le site ne
// prend aucune commande : « Commander » ouvre le site de commande existant
// (ADR 0088 §3). Prix d'un développeur : budgets publiés sur Codeur.com
// (500 à 1 000 €), repère de Mehdi ≈ 700 €.
export const article: BlogArticle = {
  slug: "site-internet-restaurant-developpeur-ou-boosteats",
  category: "Comparatifs",
  title: "Site internet de restaurant : développeur ou Boosteats ?",
  metaTitle: "Site internet de restaurant : prix et options",
  metaDescription:
    "Combien coûte un site internet de restaurant en Belgique ? Développeur, outil en ligne ou site Boosteats en pilote : les prix, et ce qui compte pour Google.",
  excerpt:
    "Un développeur demande souvent 500 à 1 000 € pour créer le site d'un restaurant, puis l'hébergement. Voici ce qui compte vraiment, et ce que prépare Boosteats.",
  published: "2026-11-05",
  readingMinutes: 5,
  keywords: ["prix site internet restaurant", "création site restaurant belgique", "site restaurant commande en ligne", "développeur site restaurant", "site web restaurant bruxelles"],
  blocks: [
    {
      type: "p",
      text: "Un site de restaurant a deux missions : être trouvé sur Google quand quelqu'un cherche « poulet frit près de moi », et mener le client à commander, appeler ou venir. Beaucoup de sites font la première à moitié et oublient la seconde. Voici les options, et leur prix.",
    },
    { type: "h2", id: "options", text: "Les trois options" },
    {
      type: "table",
      head: ["", "Un développeur", "Un outil en ligne", "Boosteats (en pilote)"],
      rows: [
        ["Prix", "500 à 1 000 € la création, puis l'hébergement", "Dès 20 € par mois (Restoline, site et réservation)", "Dans le forfait Pro (500 € HTVA par mois)"],
        ["Contenu", "Fait sur mesure", "Un modèle à remplir", "Créé à partir de votre carte, vos photos et vos horaires"],
        ["Mises à jour", "À payer, ou à faire vous-même", "À faire vous-même", "Suivent votre carte et vos promos"],
        ["Pensé pour Google", "Selon le développeur", "Souvent basique", "Oui, c'est le but du site"],
        ["Le bouton Commander", "Selon le projet", "Selon l'outil", "Vers votre site de commande actuel, sinon Appeler ou Itinéraire"],
      ],
    },
    { type: "h2", id: "developpeur", text: "Un développeur : sur mesure, mais à entretenir" },
    {
      type: "p",
      text: "Les budgets publiés pour un site de restaurant avec commande en ligne tournent autour de 500 à 1 000 €, environ 700 € en moyenne. Un bon développeur fait un site qui vous ressemble. Le piège : six mois plus tard, la carte a changé, la promo est finie, et chaque modification se paie ou attend.",
    },
    { type: "h2", id: "boosteats", text: "Le site Boosteats : ce qu'on prépare" },
    {
      type: "ul",
      items: [
        "Nina, l'assistante du site, le crée à partir de votre carte, vos photos et vos horaires, déjà dans Boosteats.",
        "La promo de votre pub du moment s'affiche en haut du site.",
        "Le bouton Commander mène à votre site de commande actuel : Boosteats ne prend ni commande ni paiement.",
        "Chaque mois, un rapport montre votre place sur Google Maps quartier par quartier.",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "En pilote",
      text: "Le site Boosteats est en test avec quelques établissements. Il arrive dans le forfait Pro ; demandez-nous s'il reste une place de pilote.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Votre site actuel aide-t-il Google ?",
      text: "L'analyse gratuite regarde votre fiche Google et la vitesse de votre site sur téléphone, en une minute.",
    },
  ],
  faq: [
    {
      q: "Combien coûte la création d'un site de restaurant ?",
      a: "Chez un développeur indépendant, les budgets publiés vont de 500 à 1 000 € pour la création, plus l'hébergement et les modifications. Les outils en ligne démarrent autour de 20 € par mois.",
    },
    {
      q: "Le site Boosteats prend-il des commandes ?",
      a: "Non. Le bouton Commander ouvre votre site de commande actuel. S'il n'y en a pas, le bouton propose d'appeler le restaurant ou d'ouvrir l'itinéraire.",
    },
  ],
  related: ["blog/agence-referencement-restaurant-ou-boosteats", "visibilite-restaurant", "fiche-google-restaurant", "blog/combien-coute-le-marketing-d-un-restaurant"],
};
