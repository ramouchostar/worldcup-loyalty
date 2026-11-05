import type { AssistantId } from "./agents/types";
import type { Plan } from "./entitlements";
import { AD_FEE_PCT } from "./service-offers";

// Le comparatif « ce que vous payeriez ailleurs » (maquette validée par Mehdi le
// 2026-11-05) : une seule source pour la section de la landing
// (components/restaurateurs/ComparisonSection.tsx) et les articles comparatifs
// du blog (lib/blog/articles/*-ou-boosteats.ts).
//
// Règles :
// - prix PUBLICS, HTVA, par établissement, relevés à la date COMPARISON_CHECKED
//   et arrondis ; chaque marque garde sa source. À relire tous les 6 mois
//   (le test `lib/comparatif.test.ts` échoue au-delà de 200 jours) ;
// - moyennes PRUDENTES : la fidélité à 50 € (Joyn et Zerosix affichent 17 à
//   68 €), pas 150-300 € — un restaurateur qui a déjà Joyn doit pouvoir vérifier ;
// - le budget pub (payé à Meta) n'est compté nulle part ; nos frais Pub sont
//   écrits en face (AD_FEE_PCT, selon le forfait) ;
// - le site (Nina) se compare à un développeur, à la création (≈ 700 €,
//   décision de Mehdi du 2026-11-05) : il n'entre PAS dans le total mensuel,
//   il s'affiche à part. Owner.com retiré (pas en Europe) ;
// - Nina et Max sont en pilote (ADR 0070) ;
// - mots du site public : jamais « SEO » ni « CRM » dans le texte visible.

export const COMPARISON_CHECKED = "2026-11-05";

export const PLAN_PRICE_EUR: Record<Plan, number> = { gratuit: 0, croissance: 150, pro: 500 };
export const PLAN_NAME: Record<Plan, string> = { gratuit: "Gratuit", croissance: "Croissance", pro: "Pro" };
const RANK: Record<Plan, number> = { gratuit: 0, croissance: 1, pro: 2 };

export type ComparedBrand = {
  name: string;
  price: string;
  /** Page où le prix a été relevé. */
  source: string;
  /** Article comparatif du blog (slug), s'il existe. */
  article?: string;
};

export type ComparisonRow = {
  id: AssistantId;
  /** Le poste, dit comme le restaurateur le chercherait. */
  job: string;
  /** Ce que fait l'assistant, en quelques mots. */
  post: string;
  /** Premier forfait qui l'inclut. */
  from: Plan;
  /** Prix moyen retenu, en euros HTVA. */
  avg: number;
  /** « mois » : abonnement ; « création » : payé une fois, hors total mensuel. */
  unit: "mois" | "création";
  pilot?: boolean;
  brands: ComparedBrand[];
  note?: string;
};

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    id: "lea",
    job: "Programme de fidélité",
    post: "inscrit et récompense",
    from: "gratuit",
    avg: 50,
    unit: "mois",
    brands: [
      { name: "Joyn", price: "17 à 68 €", source: "https://joyn.eu/fr-be/commercant/abonnements/", article: "joyn-ou-boosteats" },
      {
        name: "Zerosix",
        price: "49 € + 190 € de mise en service",
        source: "https://www.zerosix.com/tarifs-programme-fidelite",
        article: "zerosix-ou-boosteats",
      },
    ],
  },
  {
    id: "hugo",
    job: "Relances de vos clients",
    post: "relance vos clients",
    from: "gratuit",
    avg: 70,
    unit: "mois",
    brands: [
      { name: "Brevo", price: "15 € + 45 € les 1 000 SMS", source: "https://getkanal.com/fr/blog/brevo-prix", article: "brevo-ou-boosteats" },
      { name: "Zenchef", price: "dès 109 €", source: "https://www.capterra.fr/software/174819/zenbook", article: "zenchef-ou-boosteats" },
    ],
  },
  {
    id: "chloe",
    job: "Analyse des ventes et food cost",
    post: "suit les chiffres",
    from: "gratuit",
    avg: 150,
    unit: "mois",
    brands: [
      { name: "Tenzo", price: "95 à 235 €", source: "https://www.capterra.co.uk/software/177965/tenzo", article: "tenzo-ou-boosteats" },
      {
        name: "Apicbase",
        price: "dès 150 €",
        source: "https://www.softwaresuggest.com/apicbase-food-management/pricing",
        article: "apicbase-ou-boosteats",
      },
    ],
  },
  {
    id: "emma",
    job: "Agence pub Facebook et Instagram",
    post: "lance les publicités en ligne",
    from: "gratuit",
    avg: 400,
    unit: "mois",
    brands: [
      { name: "Trinity", price: "dès 150 €", source: "https://trinityagence.com/services-marketing-digital/meta-ads/", article: "agence-pub-facebook-restaurant-ou-boosteats" },
      {
        name: "FCR Media",
        price: "220 à 563 €",
        source: "https://fcrmedia.be/fr/service/faire-de-la-publicite-sur-les-reseaux-sociaux/",
        article: "agence-pub-facebook-restaurant-ou-boosteats",
      },
      { name: "Customer Impact", price: "dès 500 €", source: "https://www.customerimpact.be/fr/services/meta-ads/", article: "agence-pub-facebook-restaurant-ou-boosteats" },
    ],
    note: "Frais de gestion, hors budget pub.",
  },
  {
    id: "louis",
    job: "Réponses aux avis Google",
    post: "répond aux avis",
    from: "croissance",
    avg: 100,
    unit: "mois",
    brands: [
      { name: "Malou", price: "169 €", source: "https://www.getrevyo.com/blog/alternative-malou", article: "malou-ou-boosteats" },
      {
        name: "Guest Suite",
        price: "39 à 49 €",
        source: "https://www.lafabriquedunet.fr/logiciels/comparateur/partoo-vs-guest-suite",
        article: "guest-suite-ou-boosteats",
      },
    ],
  },
  {
    id: "nina",
    job: "Site internet qui donne envie de commander",
    post: "crée votre site",
    from: "pro",
    avg: 700,
    unit: "création",
    pilot: true,
    brands: [
      {
        name: "Développeur indépendant",
        price: "500 à 1 000 € la création",
        source: "https://www.codeur.com/projects/444431-site-restaurant-pouvant-prendre-commande-en-ligne",
        article: "site-internet-restaurant-developpeur-ou-boosteats",
      },
      { name: "Restoline", price: "dès 20 € par mois, site et réservation", source: "https://www.restoline.be/" },
    ],
    note: "Payé une fois à la création, puis l'hébergement et les mises à jour.",
  },
  {
    id: "max",
    job: "Référencement local sur Google",
    post: "améliore votre visibilité",
    from: "pro",
    avg: 500,
    unit: "mois",
    pilot: true,
    brands: [
      {
        name: "Agences de référencement à Bruxelles",
        price: "390 à 900 €",
        source: "https://vpixel.be/combien-coute-seo-belgique",
        article: "agence-referencement-restaurant-ou-boosteats",
      },
      { name: "Malou Copilot", price: "550 à 600 €", source: "https://www.getrevyo.com/blog/alternative-malou", article: "malou-ou-boosteats" },
    ],
  },
];

export const isIncluded = (row: ComparisonRow, plan: Plan) => RANK[row.from] <= RANK[plan];

/** Ce que précise la case « Chez Boosteats » sous « Inclus ». */
export function includedDetail(row: ComparisonRow, plan: Plan): string | null {
  if (row.id === "emma") return `frais ${AD_FEE_PCT[plan]} % du budget pub`;
  if (row.id === "louis") return "par notre équipe, avec vous";
  if (row.pilot) return "avec quelques établissements pilotes";
  return null;
}

export type ComparisonTotals = {
  /** Total des abonnements ailleurs, par mois. */
  monthly: number;
  /** Ce qui se paie une fois ailleurs (création du site). */
  oneOff: number;
  /** Nombre d'abonnements ou de prestataires ailleurs. */
  count: number;
  price: number;
  /** Différence par mois, abonnements seulement. */
  savedMonthly: number;
};

export function comparisonTotals(plan: Plan): ComparisonTotals {
  const rows = COMPARISON_ROWS.filter((r) => isIncluded(r, plan));
  const monthly = rows.filter((r) => r.unit === "mois").reduce((s, r) => s + r.avg, 0);
  const oneOff = rows.filter((r) => r.unit === "création").reduce((s, r) => s + r.avg, 0);
  const price = PLAN_PRICE_EUR[plan];
  return { monthly, oneOff, count: rows.length, price, savedMonthly: monthly - price };
}

/** « 1 270 € » : espace insécable fixe, identique côté serveur et navigateur
 * (toLocaleString varie selon l'ICU et casse l'hydratation). */
export const euros = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}\u00a0€`;

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** « novembre 2026 », sans dépendre de l'ICU (même rendu serveur et navigateur). */
export const checkedLabel = () => {
  const [y, m] = COMPARISON_CHECKED.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
