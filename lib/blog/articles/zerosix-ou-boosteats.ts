import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : sources dans lib/comparatif.ts. Fonctions de
// Zerosix d'après sa page tarifs et les fiches La Fabrique du Net et Appvizer.
export const article: BlogArticle = {
  slug: "zerosix-ou-boosteats",
  category: "Comparatifs",
  title: "Zerosix ou Boosteats : comparatif pour la fidélité d'un restaurant",
  metaTitle: "Zerosix ou Boosteats : comparatif fidélité",
  metaDescription:
    "Zerosix ou Boosteats pour la fidélité d'un restaurant ? Caisse à brancher ou ticket en photo, SMS ou WhatsApp, prix réels : le comparatif point par point.",
  excerpt:
    "Zerosix branche la fidélité sur votre caisse et envoie des SMS. Boosteats part du ticket en photo et ajoute la pub et les chiffres. Ce qui compte pour choisir.",
  published: "2026-11-05",
  readingMinutes: 5,
  keywords: ["zerosix avis", "zerosix prix", "alternative zerosix", "logiciel fidélité restaurant", "fidélité caisse restaurant"],
  blocks: [
    {
      type: "p",
      text: "Zerosix est un programme de fidélité français pour les commerces de proximité et les métiers de bouche, compatible avec plusieurs dizaines de logiciels de caisse. Boosteats fait gagner des points à partir du ticket de caisse pris en photo, sans rien brancher. Le choix dépend surtout de votre caisse et de ce que vous voulez faire de vos clients ensuite.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Zerosix", "Boosteats"],
      rows: [
        ["Comment le client gagne ses points", "Au passage en caisse, si votre caisse est compatible", "Il prend son ticket en photo"],
        ["Ce qu'il faut installer", "Le branchement à votre logiciel de caisse", "Rien : une affiche et un QR code"],
        ["Carte du client", "Dans le portefeuille du téléphone", "Une page web, sans appli"],
        ["Les relances", "SMS, e-mail et portefeuille, avec des SMS payés en plus", "Notification et WhatsApp, proposées chaque matin"],
        ["Les cadeaux", "Fixés par le commerçant", "Calculés sur le prix de revient, au taux que vous choisissez"],
        ["La pub Facebook et Instagram", "Non", "Montée pour vous"],
        ["Prix public", "49 € HTVA par mois + 190 € de mise en service", "Gratuit pour commencer, puis 150 € ou 500 € HTVA par mois"],
      ],
    },
    { type: "h2", id: "ce-que-zerosix-fait-bien", text: "Ce que Zerosix fait bien" },
    {
      type: "ul",
      items: [
        "Branché sur la caisse : le client n'a aucun geste à faire, les points arrivent au paiement.",
        "Les SMS, qui touchent aussi les clients qui ne regardent pas leurs notifications.",
        "La carte dans le portefeuille du téléphone, toujours sous la main.",
        "Un prix mensuel clair et sans engagement.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "Aucune dépendance à votre caisse : si vous changez de logiciel, la fidélité continue.",
        "Pas de frais de mise en service, et un forfait Gratuit pour commencer.",
        "Des cadeaux dont vous connaissez le coût d'avance, calculés sur le prix de revient de chaque plat.",
        "Une pub de quartier, le chiffre du jour et la réponse aux avis Google dans le même forfait.",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "Ce que Boosteats ne fait pas",
      text: "Pas de SMS : nos relances partent en notification sur le téléphone et sur WhatsApp, aux clients qui l'ont accepté. Et le client fait un geste (la photo du ticket), là où Zerosix compte les points tout seul en caisse.",
    },
    { type: "h2", id: "prix", text: "Le prix" },
    {
      type: "p",
      text: "Zerosix affiche 49 € HTVA par mois et par établissement, plus 190 € de mise en service, et les SMS en plus (relevé de novembre 2026). La première année revient donc à environ 780 € hors SMS. Chez Boosteats, la fidélité et les relances sont dans le forfait Gratuit.",
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Quand choisir Zerosix",
      text: "Si votre caisse est compatible et que vous tenez aux SMS, Zerosix est un très bon outil de fidélité. Si vous voulez ne rien brancher et réunir fidélité, pub et chiffres, regardez Boosteats.",
    },
    {
      type: "cta",
      kind: "whatsapp",
      title: "Une question sur votre caisse ?",
      text: "Écrivez-nous sur WhatsApp : on vous dit en deux minutes comment ça se passerait chez vous.",
    },
  ],
  faq: [
    {
      q: "Boosteats marche-t-il avec ma caisse ?",
      a: "Avec toutes : on ne se branche pas dessus. Le client prend son ticket en photo, et le numéro de commande imprimé évite qu'un ticket serve deux fois.",
    },
    {
      q: "Combien coûte Zerosix ?",
      a: "49 € HTVA par mois et par établissement, plus 190 € de mise en service, d'après la page tarifs relevée en novembre 2026. Les SMS sont facturés en plus.",
    },
  ],
  related: ["blog/joyn-ou-boosteats", "blog/brevo-ou-boosteats", "blog/combien-coute-le-marketing-d-un-restaurant", "programme-fidelite-restaurant"],
};
