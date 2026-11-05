import { COMPARISON_ROWS, PLAN_NAME, comparisonTotals, euros } from "../../comparatif";
import type { BlogArticle } from "../types";

// Article pilier des comparatifs (2026-11-05) : le tableau de la landing en
// version longue, construit depuis lib/comparatif.ts (mêmes prix, mêmes sources).
const croissance = comparisonTotals("croissance");
const pro = comparisonTotals("pro");

export const article: BlogArticle = {
  slug: "combien-coute-le-marketing-d-un-restaurant",
  category: "Comparatifs",
  title: "Combien coûte le marketing d'un restaurant ? Les prix, outil par outil",
  metaTitle: "Combien coûte le marketing d'un restaurant ? (prix)",
  metaDescription:
    "Fidélité, relances, pub Facebook, avis Google, chiffres, site, référencement : le vrai prix de chaque outil pour un restaurant en Belgique, relevé en 2026.",
  excerpt:
    "Une appli de fidélité, un outil d'envoi, une agence pub, un logiciel d'analyse, la gestion des avis… Voici ce que coûte chaque poste quand on le prend séparément, avec les marques et leurs prix publics.",
  published: "2026-11-05",
  readingMinutes: 7,
  keywords: [
    "prix logiciel restaurant",
    "combien coûte une agence marketing restaurant",
    "prix programme de fidélité restaurant",
    "outils marketing restaurant",
    "prix agence pub facebook restaurant",
  ],
  blocks: [
    {
      type: "p",
      text: "Un restaurateur qui veut faire revenir ses clients et en attirer de nouveaux finit souvent avec une pile d'abonnements : une appli de fidélité, un outil pour envoyer des messages, une agence pour la pub Facebook, un logiciel pour suivre ses ventes, un autre pour ses avis Google. Chacun a sa facture, son identifiant, et personne ne fait le lien entre eux.",
    },
    {
      type: "p",
      text: "On a relevé les prix publics de chaque poste en novembre 2026, sur les sites des éditeurs, des agences belges et des comparateurs. Les montants sont HTVA, par établissement et par mois, et arrondis. Ils peuvent changer : vérifiez toujours le prix du jour avant de signer.",
    },
    { type: "h2", id: "tableau", text: "Le tableau, poste par poste" },
    {
      type: "table",
      head: ["Le poste", "Exemples et prix publics", "Moyenne retenue", "Chez Boosteats"],
      rows: COMPARISON_ROWS.map((r) => [
        r.pilot ? `${r.job} (en pilote chez nous)` : r.job,
        r.brands.map((b) => `${b.name} : ${b.price}`).join(" · "),
        `≈ ${euros(r.avg)} ${r.unit === "mois" ? "par mois" : "à la création"}`,
        `Inclus dès le forfait ${PLAN_NAME[r.from]}`,
      ]),
    },
    {
      type: "callout",
      tone: "attention",
      title: "Le budget pub n'est compté nulle part",
      text: "Pour la pub Facebook et Instagram, le tableau compare les frais de gestion. Le budget lui-même (ce que vous payez à Meta pour diffuser) se paie dans tous les cas, chez une agence comme chez nous. Chez Boosteats, les frais sont un pourcentage de ce budget : 20 % en Gratuit, 15 % en Croissance, 5 % en Pro.",
    },
    { type: "h2", id: "total", text: "Le total, selon ce que vous prenez" },
    {
      type: "ul",
      items: [
        `Les cinq postes du forfait Croissance (fidélité, relances, chiffres, pub, avis) coûtent environ ${euros(croissance.monthly)} par mois chez des spécialistes, contre ${euros(croissance.price)} HTVA chez nous.`,
        `Les sept postes du forfait Pro coûtent environ ${euros(pro.monthly)} par mois, plus environ ${euros(pro.oneOff)} une fois pour faire créer le site, contre ${euros(pro.price)} HTVA par mois chez nous.`,
        "Le forfait Gratuit couvre déjà la fidélité, les relances, le chiffre du jour et le coût de chaque plat, et la pub sur demande.",
      ],
    },
    { type: "h2", id: "ce-que-le-prix-ne-dit-pas", text: "Ce que le prix ne dit pas" },
    {
      type: "p",
      text: "Comparer les prix ne suffit pas : un outil spécialisé va souvent plus loin sur son sujet. Un logiciel de food cost gère vos stocks et vos achats ; une appli de fidélité branchée sur la caisse compte les points sans photo. Si un seul poste compte pour vous et que vous avez le temps de vous en occuper, l'outil spécialisé peut être le bon choix.",
    },
    {
      type: "p",
      text: "La différence d'un forfait unique, c'est que les postes se parlent. La liste des clients inscrits sert aux relances ; la pub annonce l'offre que vos clients utilisent au comptoir ; le chiffre du jour montre si la semaine a bougé. Et chaque matin, vous recevez quelques idées à valider d'un Oui ou d'un Non, au lieu de piloter sept outils.",
    },
    {
      type: "compare",
      badTitle: "Sept outils séparés",
      bad: [
        "Sept abonnements et sept factures",
        "Des données qui ne se croisent pas",
        "À vous de penser la prochaine action",
        "Une installation par outil, souvent branchée sur la caisse",
      ],
      goodTitle: "Un seul forfait Boosteats",
      good: [
        "Un prix par mois, Gratuit pour commencer",
        "La liste des clients sert à tous les postes",
        "Des idées chaque matin, que vous validez",
        "Rien à brancher : le ticket de caisse suffit",
      ],
    },
    { type: "h2", id: "comparatifs", text: "Nos comparatifs détaillés" },
    {
      type: "ul",
      items: [
        "Fidélité : Joyn ou Boosteats, Zerosix ou Boosteats.",
        "Relances : Brevo ou Boosteats, Zenchef ou Boosteats.",
        "Chiffres : Tenzo ou Boosteats, Apicbase ou Boosteats.",
        "Pub : une agence Facebook et Instagram ou Boosteats.",
        "Avis Google : Malou ou Boosteats, Guest Suite ou Boosteats.",
        "Site et Google : un développeur ou Boosteats, une agence de référencement ou Boosteats.",
      ],
    },
    {
      type: "cta",
      kind: "analyse",
      title: "Commencez par voir où vous en êtes",
      text: "L'analyse gratuite montre en une minute comment votre restaurant se situe face à ceux d'à côté sur Google, et ce qu'il faut corriger en premier.",
    },
  ],
  faq: [
    {
      q: "Combien coûte une agence pour la pub Facebook d'un restaurant ?",
      a: "En Belgique, les frais de gestion relevés vont d'environ 150 € à 600 € HTVA par mois, hors budget pub. Certaines agences facturent un pourcentage du budget, avec un minimum mensuel.",
    },
    {
      q: "Combien coûte un programme de fidélité pour un restaurant ?",
      a: "Les applis de fidélité affichent de 17 € à 68 € HTVA par mois (Joyn), ou 49 € par mois plus 190 € de mise en service (Zerosix). Chez Boosteats, la fidélité est dans le forfait Gratuit.",
    },
    {
      q: "Les prix de ce comparatif sont-ils à jour ?",
      a: "Ils ont été relevés en novembre 2026 et sont relus tous les six mois. Une offre sur devis peut coûter plus ou moins : vérifiez toujours le prix du jour chez l'éditeur.",
    },
  ],
  related: [
    "blog/joyn-ou-boosteats",
    "blog/agence-pub-facebook-restaurant-ou-boosteats",
    "blog/malou-ou-boosteats",
    "programme-fidelite-restaurant",
  ],
};
