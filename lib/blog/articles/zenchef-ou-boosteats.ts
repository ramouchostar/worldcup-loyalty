import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : sources dans lib/comparatif.ts. Zenchef est
// d'abord un outil de réservation : on le dit, et on dit qu'ils se complètent.
export const article: BlogArticle = {
  slug: "zenchef-ou-boosteats",
  category: "Comparatifs",
  title: "Zenchef ou Boosteats : réservation ou retour des clients ?",
  metaTitle: "Zenchef ou Boosteats : quelle différence ?",
  metaDescription:
    "Zenchef gère réservations et fiches clients. Boosteats fait revenir ceux qui passent sans réserver. Comparatif honnête, et quand prendre les deux ensemble.",
  excerpt:
    "Zenchef est fait pour les restaurants qui travaillent sur réservation. Boosteats pour ceux dont les clients passent au comptoir. Les deux se complètent plus qu'ils ne s'opposent.",
  published: "2026-11-05",
  readingMinutes: 4,
  keywords: ["zenchef avis", "zenchef prix", "alternative zenchef", "fichier client restaurant", "marketing restaurant"],
  blocks: [
    {
      type: "p",
      text: "Zenchef est un outil de réservation de tables, avec une fiche pour chaque client qui a réservé et des campagnes d'e-mails et de SMS. Boosteats s'adresse aux restaurants où l'on passe sans réserver : restauration rapide, à emporter, snack, petit restaurant de quartier. Le bon outil dépend de la façon dont vos clients arrivent chez vous.",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Zenchef", "Boosteats"],
      rows: [
        ["Le cœur de l'outil", "La réservation de tables", "Faire revenir les clients et en faire venir de nouveaux"],
        ["D'où viennent les contacts", "Des réservations", "Des tickets pris en photo au comptoir"],
        ["Les messages aux clients", "E-mails et SMS", "Notification et WhatsApp, avec une idée chaque matin"],
        ["Fidélité et cadeaux", "Selon l'offre", "Points et cadeaux calculés sur le prix de revient"],
        ["Pub Facebook et Instagram", "Non", "Montée pour vous"],
        ["Prix public", "Dès 109 € HTVA par mois (sur devis)", "Gratuit pour commencer, puis 150 € ou 500 € HTVA par mois"],
      ],
    },
    { type: "h2", id: "ce-que-zenchef-fait-bien", text: "Ce que Zenchef fait bien" },
    {
      type: "ul",
      items: [
        "La réservation en ligne, le plan de salle et la gestion des tables.",
        "L'historique de chaque client qui a réservé, au même endroit.",
        "Des campagnes d'e-mails et de SMS vers ces clients.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "Il touche les clients qui ne réservent jamais : ceux qui commandent au comptoir ou à emporter.",
        "Il donne une raison de revenir : des points et des cadeaux dont vous connaissez le coût.",
        "Il ajoute la pub dans le quartier, la réponse aux avis Google et le chiffre du jour.",
      ],
    },
    {
      type: "callout",
      tone: "astuce",
      title: "Quand choisir Zenchef",
      text: "Si vos clients réservent leur table, Zenchef est fait pour vous et Boosteats ne le remplace pas. Si la plupart passent sans réserver, Boosteats est plus adapté. Une brasserie qui a les deux types de clients peut garder Zenchef pour la salle et Boosteats pour faire revenir les autres.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Regardez d'abord votre fiche Google",
      text: "L'analyse gratuite compare en une minute votre restaurant à ceux d'à côté.",
    },
  ],
  faq: [
    {
      q: "Boosteats gère-t-il les réservations ?",
      a: "Non. Boosteats ne prend ni réservation ni commande : il fait revenir vos clients et en attire de nouveaux.",
    },
    {
      q: "Combien coûte Zenchef ?",
      a: "Zenchef fonctionne sur devis ; un comparateur indique un prix de départ de 109 €, relevé en novembre 2026. Demandez un devis pour votre restaurant.",
    },
  ],
  related: ["blog/brevo-ou-boosteats", "blog/combien-coute-le-marketing-d-un-restaurant", "relancer-vos-clients", "programme-fidelite-restaurant"],
};
