// ADR 0069 §5 — ce que le rapport affiche, calculé à partir d'un audit
// enregistré. Pur et testé : le composant ne fait que mettre en page.
//
// Règles : aucune promesse chiffrée inventée (la note Google visée n'est pas
// affichée, seul le score d'audit « si les priorités sont faites ») ; un volet
// non mesuré s'affiche « bientôt », jamais 0.

import { BRUSSELS_POSTAL_CODES } from "./brussels";
import type { BusinessInfo, StoredReview } from "./dataforseo";
import type { Criterion, FicheScore } from "./fiche-score";
import type { ReviewsResultSummary } from "./measure";
import { scoreReviews } from "./measure";
import type { Horizon, Scenario } from "./scenarios";
import type { Trend } from "./signals";

// Critères que le gérant ne règle pas d'un geste : la note et le volume d'avis.
const NOT_ACTIONABLE = new Set(["note", "volume"]);
const WEIGHT = { ok: 1, partiel: 0.5, manquant: 0 } as const;

export function fichePotential(score: FicheScore): number | null {
  const verified = score.criteria.filter((c) => c.status !== "non_verifie");
  const max = verified.reduce((a, c) => a + c.points, 0);
  if (!max) return null;
  const got = verified.reduce((a, c: Criterion) => {
    if (!NOT_ACTIONABLE.has(c.key)) return a + c.points;
    return a + c.points * WEIGHT[c.status as keyof typeof WEIGHT];
  }, 0);
  return Math.round((got / max) * 100);
}

export function avisPotential(rating: number | null, s: ReviewsResultSummary, trend: Trend | null): number | null {
  const current = scoreReviews(rating, s, trend);
  if (current == null) return null;
  // Seul levier immédiat : répondre à tous les avis.
  const better = scoreReviews(rating, { ...s, responses: { ...s.responses, share: 1 } }, trend);
  return Math.max(current, better ?? current);
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

export function communeOf(postalCode: string | null): string | null {
  return postalCode ? BRUSSELS_POSTAL_CODES[postalCode] ?? null : null;
}

/** « Restaurant de hamburgers » → « hamburgers » ; « Pizzeria » → « pizzeria ». */
export function categoryShort(category: string | null): string | null {
  if (!category) return null;
  const c = category.trim();
  const m = c.match(/^restaurant (?:de |d')?(.+)$/i);
  return (m ? m[1] : c).toLowerCase();
}

const PRICE: Record<string, string> = { inexpensive: "€", moderate: "€€", expensive: "€€€", very_expensive: "€€€€" };

export type ActionKey = "itineraire" | "appeler" | "site" | "commander" | "menu";
export type ActionState = "on" | "off" | "new";

export interface CardModel {
  name: string;
  rating: number | null;
  reviews: number | null;
  category: string | null;
  price: string | null;
  open: string | null;
  photo: string | null;
  actions: { key: ActionKey; state: ActionState }[];
}

function hasLink(info: BusinessInfo & { book_online_url?: string | null }, kind: "order" | "menu"): boolean {
  const links = (info.local_business_links ?? []).map((l) => l.type.toLowerCase());
  if (kind === "order") return links.some((l) => l.includes("order")) || !!info.book_online_url;
  return links.some((l) => l.includes("menu"));
}

export function cardsFor(info: BusinessInfo & { main_image?: string | null; book_online_url?: string | null; work_time?: { work_hours?: { current_status?: string | null } | null } | null }, gapsToFix: string[]) {
  const base = {
    name: info.title ?? "",
    rating: info.rating?.value ?? null,
    reviews: info.rating?.votes_count ?? null,
    category: info.category,
    price: info.price_level ? PRICE[info.price_level] ?? null : null,
    open: info.work_time?.work_hours?.current_status === "open" ? "Ouvert" : info.work_time?.work_hours?.current_status === "close" ? "Fermé" : null,
    photo: info.main_image ?? null,
  };
  const has: Record<ActionKey, boolean> = {
    itineraire: true,
    appeler: !!info.phone,
    site: !!info.url,
    commander: hasLink(info, "order"),
    menu: hasLink(info, "menu"),
  };
  const fixes: Partial<Record<ActionKey, boolean>> = {
    commander: gapsToFix.includes("pas_de_lien_commande"),
    menu: gapsToFix.includes("pas_de_menu"),
    appeler: gapsToFix.includes("pas_de_telephone"),
    site: gapsToFix.includes("pas_de_site"),
  };
  const keys: ActionKey[] = ["itineraire", "appeler", "site", "commander", "menu"];
  const today: CardModel = { ...base, actions: keys.map((key) => ({ key, state: has[key] ? "on" : "off" })) };
  const after: CardModel = {
    ...base,
    actions: keys.map((key) => ({ key, state: has[key] ? "on" : fixes[key] ? "new" : "off" })),
  };
  return { today, after };
}

/** Dernier avis négatif avec texte, pour illustrer la fiche « aujourd'hui ». */
export function latestNegative(reviews: StoredReview[]): { text: string; answered: boolean } | null {
  const r = [...reviews]
    .filter((x) => x.rating != null && x.rating <= 2 && x.text && x.text.trim().length > 15 && x.date)
    .sort((a, b) => b.date!.localeCompare(a.date!))[0];
  if (!r) return null;
  const t = r.text!.replace(/\s+/g, " ").trim();
  return { text: t.length > 110 ? t.slice(0, 107).trimEnd() + "…" : t, answered: !!r.ownerAnswer };
}

export interface Hero {
  eyebrow: string;
  before: string;
  highlight: string;
  after: string;
  lead: string;
  now: number | null;
  potential: number | null;
}

export function heroFor(input: {
  name: string;
  commune: string | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  responseShare: number | null;
  top: Pick<Scenario, "title">[];
  now: number | null;
  potential: number | null;
  date: Date;
}): Hero {
  const where = input.commune ? `à ${input.commune}` : "à Bruxelles";
  const cat = categoryShort(input.category);
  const g = input.now ?? 0;
  const eyebrow = `Audit du ${input.date.toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}${input.commune ? ` · ${input.commune}` : ""}`;
  const [before, highlight, after] =
    g >= 85
      ? [`${input.name} fait déjà partie `, `des meilleures adresses${cat ? ` ${cat}` : ""} ${where}`, ". Voici comment le rester, et le faire savoir."]
      : g >= 65
        ? [`${input.name} a tout pour devenir `, `la référence${cat ? ` ${cat}` : ""} ${where}`, "."]
        : [`${input.name} peut regagner vite `, `la confiance de ses clients ${where}`, "."];

  const strengths: string[] = [];
  if (input.rating != null && input.reviews != null && input.rating >= 4.3)
    strengths.push(`Vos clients vous donnent ${input.rating.toLocaleString("fr-BE")}★ sur ${input.reviews.toLocaleString("fr-BE")} avis`);
  if (input.responseShare != null && input.responseShare >= 0.8) strengths.push("vous répondez à presque tous");
  const fixes = input.top.slice(0, 3).map((s) => s.title.charAt(0).toLowerCase() + s.title.slice(1));
  const lead = [
    strengths.length ? strengths.join(", et ") + "." : null,
    fixes.length ? `${g >= 85 ? "Pour aller plus loin" : "Ce qui vous freine se règle"} : ${fixes.join(", ")}.` : null,
    "Voici le plan pour y arriver en 90 jours.",
  ]
    .filter(Boolean)
    .join(" ");
  return { eyebrow, before, highlight, after, lead, now: input.now, potential: input.potential };
}

type VoletScores = { fiche: number | null; avis: number | null; concurrents?: number | null; seo?: number | null };
/** Note globale = moyenne des volets mesurés ; le potentiel suppose les priorités faites. */
export function globalScores(scores: VoletScores, potentials: VoletScores) {
  return {
    now: mean([scores.fiche, scores.avis, scores.concurrents ?? null, scores.seo ?? null]),
    potential: mean([potentials.fiche, potentials.avis, potentials.concurrents ?? null, potentials.seo ?? null]),
  };
}

/** Potentiel SEO : tout ce qui se corrige sur le site est fait ; le rang Google, lui, se gagne dans le temps. */
export function seoPotential(seo: { checks: { key: string; points: number; status: string }[] }): number | null {
  const verified = seo.checks.filter((c) => c.status !== "non_verifie");
  const max = verified.reduce((a, c) => a + c.points, 0);
  if (!max) return null;
  const w: Record<string, number> = { ok: 1, partiel: 0.5, manquant: 0 };
  const got = verified.reduce((a, c) => a + c.points * (c.key === "google" ? w[c.status] ?? 0 : 1), 0);
  return Math.round((got / max) * 100);
}

export const HORIZON_LABEL: Record<Horizon, string> = {
  "7 jours": "Cette semaine",
  "30 jours": "Ce mois-ci",
  "90 jours": "D'ici 90 jours",
};

/** Points de la courbe : les 24 derniers mois, moyenne glissante sur 3 mois. */
export function chartPoints(s: ReviewsResultSummary, months = 24) {
  return s.monthly.slice(-months).map((m) => ({ month: m.month, value: m.rolling3, count: m.count }));
}

export const ACTION_LABEL: Record<ActionKey, string> = {
  itineraire: "Itinéraire",
  appeler: "Appeler",
  site: "Site",
  commander: "Commander",
  menu: "Menu",
};

/** Une action du plan face au concurrent qui parle de récolter des avis. */
export function isReviewCollection(a: { title: string; why: string; steps: string[] }): boolean {
  const all = [a.title, a.why, ...a.steps].join(" ");
  return /\bavis\b/i.test(a.title) && /(collect|récolt|demand|QR|obten|nouveaux avis|plus d'avis|volume)/i.test(all);
}

const REVIEW_STEP = "Activer la demande d'avis Boosteats : chaque habitué est invité à laisser son avis Google depuis son espace, après sa visite.";

/**
 * Le plan d'attaque est rédigé par Claude : quand il propose de récolter des
 * avis avec son propre QR code, c'est Boosteats qui le fait. On remplace ces
 * gestes par celui de Boosteats (aussi pour les audits déjà rédigés).
 */
export function withBoosteatsReviews<T extends { title: string; why: string; steps: string[] }>(a: T): T & { boosteats: boolean } {
  if (!isReviewCollection(a)) return { ...a, boosteats: false };
  const kept = a.steps.filter((x) => !(/QR/i.test(x) && /avis/i.test(x)));
  return { ...a, steps: [REVIEW_STEP, ...kept].slice(0, 3), boosteats: true };
}
