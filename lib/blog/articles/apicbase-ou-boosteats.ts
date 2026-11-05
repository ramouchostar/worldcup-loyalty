import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : sources dans lib/comparatif.ts. Apicbase est
// belge (Anvers) et bien plus complet sur la cuisine : on le dit.
export const article: BlogArticle = {
  slug: "apicbase-ou-boosteats",
  category: "Comparatifs",
  title: "Apicbase ou Boosteats : calculer le food cost de votre restaurant",
  metaTitle: "Apicbase ou Boosteats : food cost restaurant",
  metaDescription:
    "Apicbase gère recettes, stocks et achats des cuisines exigeantes. Boosteats donne le coût de chaque plat en un écran. Le comparatif honnête pour choisir.",
  excerpt:
    "Apicbase, éditeur belge, est un vrai outil de gestion de cuisine. Boosteats donne le coût de chaque plat pour fixer vos prix et vos cadeaux. Deux besoins différents.",
  published: "2026-11-05",
  readingMinutes: 4,
  keywords: ["apicbase avis", "apicbase prix", "logiciel food cost", "calcul food cost restaurant", "fiche technique restaurant"],
  blocks: [
    {
      type: "p",
      text: "Apicbase est un logiciel belge, basé à Anvers, pour gérer la cuisine d'un restaurant : fiches recettes, allergènes, stocks, achats, production. Boosteats ne gère pas votre cuisine. Il donne le prix de revient de chaque plat, pour savoir ce que vous gagnez sur chaque vente et ce que vous coûte chaque cadeau.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Apicbase", "Boosteats"],
      rows: [
        ["Le cœur de l'outil", "Recettes, stocks, achats, production", "Prix de vente et prix de revient de chaque plat"],
        ["La saisie", "Recettes détaillées, ingrédient par ingrédient", "Ligne par ligne sur votre carte, en un écran"],
        ["Ce qu'on en fait", "Commander, suivre les stocks, limiter les pertes", "Fixer vos prix, calculer les cadeaux de fidélité au coût réel"],
        ["Pensé pour", "Groupes, cuisines centrales, restaurants exigeants", "Indépendants"],
        ["Prix public", "Sur devis, à partir d'environ 150 € par mois", "Inclus dès le forfait Gratuit"],
      ],
    },
    { type: "h2", id: "ce-que-apicbase-fait-bien", text: "Ce qu'Apicbase fait bien" },
    {
      type: "ul",
      items: [
        "Des fiches recettes complètes, avec les allergènes.",
        "Les stocks en temps réel et les commandes aux fournisseurs.",
        "Un éditeur belge, avec des clients dans de grands groupes.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "Quelques minutes suffisent : vous notez le prix de revient de chaque plat de votre carte, sans détailler chaque gramme.",
        "Ce coût sert directement à la fidélité : chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez.",
        "Il est relié au chiffre du jour et aux ventes par plat (forfait Croissance).",
      ],
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Quand choisir Apicbase",
      text: "Si vous gérez plusieurs cuisines, des stocks importants ou des allergènes à documenter, Apicbase est l'outil qu'il vous faut. Pour un indépendant qui veut connaître sa marge par plat, le coût de chaque plat dans Boosteats suffit souvent.",
    },
    {
      type: "cta",
      kind: "whatsapp",
      title: "Vous voulez connaître la marge de vos plats ?",
      text: "Écrivez-nous sur WhatsApp : on vous montre comment noter votre carte en quelques minutes.",
    },
  ],
  faq: [
    {
      q: "Combien coûte Apicbase ?",
      a: "Apicbase fonctionne sur devis. Un comparateur indique un départ autour de 160 $ par mois pour un établissement, relevé en novembre 2026.",
    },
    {
      q: "Faut-il connaître le prix de revient exact de chaque plat ?",
      a: "Une estimation suffit pour commencer, arrondie vers le haut. Vous l'affinez ensuite, ligne par ligne.",
    },
  ],
  related: ["food-cost-restaurant", "blog/tenzo-ou-boosteats", "blog/combien-coute-le-marketing-d-un-restaurant", "chiffre-affaires-restaurant"],
};
