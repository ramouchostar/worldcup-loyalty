import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : sources dans lib/comparatif.ts (Tenzo dit
// lui-même 80 à 200 £, soit 100 à 250 $ par établissement et par mois).
export const article: BlogArticle = {
  slug: "tenzo-ou-boosteats",
  category: "Comparatifs",
  title: "Tenzo ou Boosteats : suivre le chiffre d'affaires de votre restaurant",
  metaTitle: "Tenzo ou Boosteats : suivre son chiffre d'affaires",
  metaDescription:
    "Tenzo analyse ventes, personnel et prévisions pour les groupes. Boosteats suit le chiffre du jour d'un indépendant. Comparatif honnête : prix et différences.",
  excerpt:
    "Tenzo est un outil d'analyse puissant, branché sur la caisse et le planning, pensé pour les groupes. Boosteats suit le chiffre du jour d'un indépendant en un écran. Lequel vous faut-il ?",
  published: "2026-11-05",
  readingMinutes: 4,
  keywords: ["tenzo avis", "tenzo prix", "logiciel analyse restaurant", "suivi chiffre d'affaires restaurant", "prévision ventes restaurant"],
  blocks: [
    {
      type: "p",
      text: "Tenzo est une plateforme d'analyse pour restaurants, née à Londres : elle se branche sur la caisse, le planning du personnel et les stocks, et prévoit les ventes des jours à venir. Elle vise surtout les groupes de plusieurs établissements. Boosteats suit le chiffre d'un indépendant, simplement, pour savoir chaque jour si la semaine avance.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Tenzo", "Boosteats"],
      rows: [
        ["D'où viennent les chiffres", "Branché sur la caisse, le planning et les stocks", "Le chiffre du jour noté en un écran (caisse et plateformes), et les tickets du programme"],
        ["Ce qu'on voit", "Ventes, couverts, coût du personnel, écarts de food cost", "Chiffre du jour comparé aux mêmes jours, part venue des clients inscrits, coût de chaque plat"],
        ["Les prévisions", "Oui, avec la météo et les événements", "Prévision de fréquentation (forfait Croissance)"],
        ["Ce qu'on en fait", "Des tableaux à lire", "Des idées chaque matin pour remplir les jours calmes"],
        ["Pensé pour", "Les groupes et chaînes", "Les indépendants"],
        ["Prix public", "95 à 235 € HTVA par mois et par établissement", "Gratuit pour commencer, suivi détaillé en Croissance (150 € HTVA)"],
      ],
    },
    { type: "h2", id: "ce-que-tenzo-fait-bien", text: "Ce que Tenzo fait bien" },
    {
      type: "ul",
      items: [
        "Des chiffres complets sans rien saisir, puisqu'ils viennent de la caisse.",
        "Le coût du personnel face aux ventes prévues : utile pour faire les plannings.",
        "La comparaison entre plusieurs établissements.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "Rien à brancher : noter le chiffre du jour prend moins d'une minute, quelle que soit votre caisse.",
        "Le chiffre sert à agir : Chloé, l'assistante des chiffres, repère le soir le plus calme et propose une action pour le remplir.",
        "Vous voyez la part du chiffre qui vient des clients inscrits au programme.",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "Ce que Boosteats ne fait pas",
      text: "Pas de planning du personnel, pas de stocks, et le chiffre du jour se note à la main. Pour un groupe de plusieurs restaurants qui veut tout piloter depuis la caisse, Tenzo est plus complet.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Commencez par l'analyse gratuite",
      text: "En une minute, voyez comment votre restaurant se situe face à ceux d'à côté sur Google.",
    },
  ],
  faq: [
    {
      q: "Combien coûte Tenzo ?",
      a: "Tenzo indique qu'un client paie en moyenne 80 à 200 £ par établissement et par mois, soit environ 95 à 235 €, selon les modules. Le prix se fait sur devis.",
    },
    {
      q: "Faut-il noter son chiffre tous les jours avec Boosteats ?",
      a: "C'est conseillé : moins d'une minute, en fin de service, en séparant la caisse et les plateformes de livraison. Le suivi devient vraiment utile après deux à trois semaines notées.",
    },
  ],
  related: ["blog/apicbase-ou-boosteats", "chiffre-affaires-restaurant", "blog/passer-un-palier-chiffre-affaires", "blog/combien-coute-le-marketing-d-un-restaurant"],
};
