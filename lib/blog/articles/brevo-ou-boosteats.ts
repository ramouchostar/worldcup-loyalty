import type { BlogArticle } from "../types";

// Comparatif honnête (2026-11-05) : sources dans lib/comparatif.ts (prix Brevo
// relevés par getkanal.com le 24/10/2026).
export const article: BlogArticle = {
  slug: "brevo-ou-boosteats",
  category: "Comparatifs",
  title: "Brevo ou Boosteats : comment relancer les clients de votre restaurant",
  metaTitle: "Brevo ou Boosteats pour relancer vos clients",
  metaDescription:
    "Brevo envoie très bien e-mails et SMS. Mais d'où vient la liste de vos clients ? Comparatif honnête Brevo ou Boosteats pour relancer les clients d'un resto.",
  excerpt:
    "Brevo envoie très bien des e-mails et des SMS, à condition d'avoir déjà la liste de vos clients. Boosteats la construit au comptoir, puis vous propose quoi leur envoyer.",
  published: "2026-11-05",
  readingMinutes: 5,
  keywords: ["brevo restaurant", "brevo prix", "sms marketing restaurant", "relancer clients restaurant", "alternative brevo"],
  blocks: [
    {
      type: "p",
      text: "Brevo (ex-Sendinblue) est un outil d'envoi d'e-mails et de SMS utilisé par des milliers d'entreprises en Europe. Pour un restaurant, la vraie question arrive avant l'envoi : où trouver les contacts de vos clients, et quoi leur écrire un mardi soir creux ?",
    },
    { type: "h2", id: "en-bref", text: "En bref" },
    {
      type: "table",
      head: ["", "Brevo", "Boosteats"],
      rows: [
        ["D'où vient la liste des clients", "Vous l'importez", "Elle se construit au comptoir, à chaque ticket pris en photo"],
        ["Les canaux", "E-mail, SMS, WhatsApp", "Notification sur le téléphone et WhatsApp"],
        ["Quoi envoyer, et quand", "C'est vous qui décidez et rédigez", "Une idée chaque matin, prête à valider d'un Oui ou d'un Non"],
        ["Savoir si ça a marché", "Ouvertures et clics", "Les clients revenus, comparés à un groupe qui n'a rien reçu"],
        ["Pensé pour", "Tous les métiers", "Les restaurants"],
        ["Prix public", "15 € HTVA par mois + 45 € les 1 000 SMS", "Inclus dès le forfait Gratuit"],
      ],
    },
    { type: "h2", id: "ce-que-brevo-fait-bien", text: "Ce que Brevo fait bien" },
    {
      type: "ul",
      items: [
        "Des e-mails soignés, avec des modèles prêts à l'emploi.",
        "Les SMS et WhatsApp au même endroit.",
        "Des scénarios d'envoi très complets si vous avez le temps de les construire.",
        "Un prix d'entrée bas pour l'e-mail seul.",
      ],
    },
    { type: "h2", id: "ce-que-boosteats-fait-autrement", text: "Ce que Boosteats fait autrement" },
    {
      type: "ul",
      items: [
        "La liste se construit toute seule : chaque client qui prend son ticket en photo s'inscrit, avec son accord pour recevoir vos messages.",
        "Hugo, l'assistant des relances, repère les clients qui ne sont pas revenus depuis un moment et propose un message avec une offre. Vous dites Oui ou Non.",
        "On mesure l'effet en clients revenus, pas en ouvertures : une partie des clients ne reçoit rien, pour comparer.",
        "Le coût de l'offre envoyée est calculé sur le prix de revient du plat.",
      ],
    },
    {
      type: "callout",
      tone: "attention",
      title: "Ce que Boosteats ne fait pas",
      text: "Pas de SMS ni de newsletter graphique. Si votre restaurant a déjà une grosse liste d'e-mails et quelqu'un pour écrire les campagnes, Brevo vous donnera plus de liberté.",
    },
    { type: "h2", id: "prix", text: "Le prix" },
    {
      type: "p",
      text: "Brevo démarre à environ 15 € HTVA par mois pour l'e-mail (offre Standard), et les SMS s'achètent à part, environ 45 € les 1 000 (relevé d'octobre 2026). Chez Boosteats, les relances sont dans le forfait Gratuit ; le forfait Croissance ajoute les messages programmés à l'avance.",
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Avant de relancer, faites-vous trouver",
      text: "L'analyse gratuite montre en une minute ce que voient les clients qui cherchent un restaurant près de chez vous.",
    },
  ],
  faq: [
    {
      q: "Peut-on envoyer des SMS avec Boosteats ?",
      a: "Non. Les relances partent en notification sur le téléphone du client et sur WhatsApp, seulement aux clients qui ont accepté de recevoir vos messages.",
    },
    {
      q: "Combien coûte Brevo pour un restaurant ?",
      a: "Environ 15 € HTVA par mois pour l'e-mail, plus environ 45 € les 1 000 SMS, d'après les prix relevés en octobre 2026. Vérifiez le prix du jour sur le site de Brevo.",
    },
  ],
  related: ["blog/zenchef-ou-boosteats", "blog/remplir-jours-creux-restaurant", "relancer-vos-clients", "blog/combien-coute-le-marketing-d-un-restaurant"],
};
