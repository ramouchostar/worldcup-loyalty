import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : agences belges citées dans lib/comparatif.ts
// (Trinity, FCR Media, Customer Impact) ; ici on compare le modèle, sans
// dénigrer aucune agence. Frais Boosteats : lib/service-offers.ts (AD_FEE_PCT).
export const article: BlogArticle = {
  slug: "agence-pub-facebook-restaurant-ou-boosteats",
  category: "Comparatifs",
  title: "Agence pub Facebook ou Boosteats : que choisir pour votre restaurant ?",
  metaTitle: "Agence pub Facebook restaurant ou Boosteats ?",
  metaDescription:
    "Combien coûte une agence pub Facebook et Instagram pour un restaurant en Belgique, et que vaut Boosteats ? Prix, méthode et suivi : le comparatif honnête.",
  excerpt:
    "Une agence pub demande souvent 150 à 600 € par mois de frais, en plus du budget. Boosteats prend un pourcentage du budget et monte une pub de quartier pensée pour un restaurant.",
  published: "2026-11-05",
  readingMinutes: 6,
  keywords: [
    "agence pub facebook restaurant",
    "agence meta ads bruxelles",
    "prix agence publicité restaurant",
    "publicité instagram restaurant",
    "agence marketing restaurant belgique",
  ],
  blocks: [
    {
      type: "p",
      text: "Pour une pub Facebook et Instagram, un restaurant paie deux choses : le budget, versé à Meta pour diffuser la pub, et les frais de celui qui la monte. Le budget, vous le payez dans tous les cas. Ce comparatif porte sur les frais, et sur ce que vous obtenez en échange.",
    },
    { type: "h2", id: "prix-agences", text: "Ce que coûte une agence en Belgique" },
    {
      type: "p",
      text: "D'après les prix publics relevés en novembre 2026, une agence belge facture la gestion de vos campagnes entre environ 150 € et 600 € HTVA par mois, hors budget. Certaines demandent un pourcentage du budget (souvent 10 à 20 %) avec un minimum de 400 à 600 € par mois. D'autres proposent des formules fixes : par exemple Trinity dès 150 €, FCR Media de 220 € à 563 € selon le budget, Customer Impact à partir de 500 €.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Une agence pub", "Boosteats"],
      rows: [
        ["Les frais", "150 à 600 € HTVA par mois, ou un pourcentage avec un minimum", "Un pourcentage du budget : 20 % en Gratuit, 15 % en Croissance, 5 % en Pro"],
        ["Avant de payer", "Un devis", "Une estimation du nombre de personnes touchées dans votre quartier"],
        ["La cible", "Selon l'agence", "Les gens à quelques kilomètres du restaurant"],
        ["L'offre", "À définir avec l'agence", "Une offre et un mot clé à dire au comptoir"],
        ["Savoir si ça a marché", "Un rapport de clics et de vues", "Les clients qui disent le mot clé au comptoir, et votre chiffre du jour"],
        ["Engagement", "Souvent quelques mois", "Une campagne à la fois, sans engagement"],
      ],
    },
    { type: "h2", id: "ce-qu-une-agence-fait-bien", text: "Ce qu'une bonne agence fait bien" },
    {
      type: "ul",
      items: [
        "La création : vidéos, photos et textes faits sur mesure.",
        "Les gros budgets et les campagnes sur plusieurs canaux.",
        "Un interlocuteur dédié, qui connaît votre marque.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "Pensé pour un restaurant de quartier : 10 à 15 € par jour suffisent souvent pour une zone de 3 km.",
        "Pas de frais fixes : sur 300 € de budget en Croissance, les frais sont de 45 €.",
        "Deux validations de votre part : l'idée, puis la pub avant qu'elle parte. Rien n'est dépensé sans votre accord.",
        "La pub annonce une offre que vos clients utilisent au comptoir : vous voyez qui vient grâce à elle.",
        "Vos vidéos peuvent être envoyées telles quelles, jusqu'à 200 Mo.",
      ],
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Quand choisir une agence",
      text: "Si vous avez un budget de plusieurs milliers d'euros par mois, plusieurs établissements et besoin de création vidéo sur mesure, une agence spécialisée vous apportera plus. Pour une pub de quartier qui annonce une promo, Boosteats coûte moins et se mesure au comptoir.",
    },
    {
      type: "cta",
      kind: "whatsapp",
      title: "Une pub pour votre prochaine promo ?",
      text: "Envoyez-nous la promo sur WhatsApp : on vous renvoie une estimation de ce que la pub toucherait dans votre quartier.",
    },
  ],
  faq: [
    {
      q: "Quel budget pub pour un restaurant de quartier ?",
      a: "Un repère : 10 à 15 € par jour pendant deux semaines, dans un rayon de 3 km. On vous montre une estimation avant de payer.",
    },
    {
      q: "Le budget pub est-il inclus dans le forfait Boosteats ?",
      a: "Non. Le budget est payé à Meta pour diffuser la pub, comme avec une agence. Boosteats prend des frais sur ce budget, selon votre forfait.",
    },
    {
      q: "Combien coûte une agence Meta Ads à Bruxelles ?",
      a: "Les frais relevés en novembre 2026 vont d'environ 150 € à 600 € HTVA par mois, hors budget, selon l'agence et la formule.",
    },
  ],
  related: ["publicite-restaurant", "blog/publicite-facebook-instagram-restaurant", "blog/publicite-tiktok-restaurant", "blog/combien-coute-le-marketing-d-un-restaurant"],
};
