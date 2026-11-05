import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : sources dans lib/comparatif.ts. Ce que fait
// Joyn d'après ses pages et celles des banques partenaires (KBC, ING, BNP).
export const article: BlogArticle = {
  slug: "joyn-ou-boosteats",
  category: "Comparatifs",
  title: "Joyn ou Boosteats : quelle fidélité pour votre restaurant ?",
  metaTitle: "Joyn ou Boosteats : comparatif fidélité restaurant",
  metaDescription:
    "Joyn ou Boosteats pour fidéliser les clients de votre restaurant ? Fonctionnement, prix, relances, pub : un comparatif honnête, et quand Joyn est le bon choix.",
  excerpt:
    "Joyn est la carte de fidélité digitale la plus connue en Belgique. Boosteats part du ticket de caisse et va jusqu'à la relance et la pub. Voici ce qui les sépare, sans détour.",
  published: "2026-11-05",
  readingMinutes: 5,
  keywords: ["joyn avis", "joyn prix", "alternative joyn", "joyn restaurant", "carte de fidélité digitale restaurant"],
  blocks: [
    {
      type: "p",
      text: "Joyn est la carte de fidélité digitale la plus répandue en Belgique : plusieurs milliers de commerces l'utilisent, et plusieurs banques la proposent à leurs clients professionnels. Boosteats est plus jeune et pensé pour les restaurants. Les deux font gagner des points à vos clients, mais pas de la même façon, et pas pour la même chose ensuite.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Joyn", "Boosteats"],
      rows: [
        ["Comment le client gagne ses points", "Il lit le QR code du commerce avec l'appli Joyn ou l'appli de sa banque", "Il prend son ticket de caisse en photo, sans appli à installer"],
        ["Ce qu'il faut installer", "Une tablette au comptoir, ou l'intégration à certaines caisses", "Rien : une affiche et un QR code"],
        ["Les cadeaux", "Fixés par le commerçant", "Calculés sur le prix de revient de chaque plat, au taux que vous choisissez (4 à 12 %)"],
        ["Les messages aux clients", "Campagnes dans la formule Expert", "Relances par notification et WhatsApp, proposées chaque matin"],
        ["La pub Facebook et Instagram", "Non", "Montée pour vous, avec une estimation avant de payer"],
        ["Le chiffre du jour et le coût des plats", "Non", "Oui, dès le forfait Gratuit"],
        ["Prix public", "17 à 68 € HTVA par mois selon la formule", "Gratuit pour commencer, puis 150 € ou 500 € HTVA par mois"],
      ],
    },
    { type: "h2", id: "ce-que-joyn-fait-bien", text: "Ce que Joyn fait bien" },
    {
      type: "ul",
      items: [
        "Une marque connue : beaucoup de clients belges ont déjà l'appli, ou l'utilisent depuis l'appli de leur banque.",
        "Un prix d'entrée bas pour une carte de points simple.",
        "Des intégrations avec certains logiciels de caisse, pour donner les points sans geste du client.",
        "Une solution éprouvée, utilisée par des commerces de tous les secteurs.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "Rien à brancher : le client prend son ticket en photo, la caisse ne change pas, on démarre en un jour.",
        "Chaque cadeau est calculé sur ce qu'il vous coûte. À 8 %, une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats : vous savez d'avance ce que la fidélité vous coûte.",
        "La liste des clients inscrits reste à votre restaurant, et sert ensuite à les relancer un soir creux.",
        "La fidélité n'est qu'un des postes : relances, pub de quartier, avis Google et chiffre du jour sont au même endroit.",
      ],
    },
    { type: "h2", id: "prix", text: "Le prix" },
    {
      type: "p",
      text: "Joyn affiche trois formules, de 17 € à 68 € HTVA par mois (relevé de novembre 2026), avec des remises proposées par certaines banques. Chez Boosteats, la fidélité est dans le forfait Gratuit, jusqu'à 500 tickets par mois. Le forfait Croissance (150 € HTVA par mois) ajoute les tickets illimités, la réponse à vos avis Google et le suivi détaillé de votre chiffre d'affaires.",
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Quand choisir Joyn",
      text: "Si vous voulez seulement une carte de points, que vos clients ont déjà l'appli et que votre caisse est compatible, Joyn fait très bien le travail. Si vous voulez aussi relancer vos clients, faire de la pub dans le quartier et suivre vos chiffres, Boosteats les réunit.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Voyez d'abord où en est votre restaurant",
      text: "L'analyse gratuite compare en une minute votre fiche Google à celles des restaurants autour de vous.",
    },
  ],
  faq: [
    {
      q: "Peut-on garder Joyn et utiliser Boosteats ?",
      a: "Oui. Rien n'empêche d'avoir les deux, mais deux cartes de points au même comptoir embrouillent vite les clients. La plupart des restaurants en gardent une seule.",
    },
    {
      q: "Mes clients doivent-ils installer une appli avec Boosteats ?",
      a: "Non. Ils ouvrent une page web depuis le QR code, prennent leur ticket en photo et peuvent ajouter la page à l'écran d'accueil de leur téléphone.",
    },
    {
      q: "Combien coûte Joyn pour un restaurant ?",
      a: "De 17 € à 68 € HTVA par mois selon la formule, d'après la grille publique relevée en novembre 2026. Vérifiez le prix du jour sur le site de Joyn.",
    },
  ],
  related: ["blog/zerosix-ou-boosteats", "blog/combien-coute-le-marketing-d-un-restaurant", "programme-fidelite-restaurant", "relancer-vos-clients"],
};
