// ADR 0076 — CRM de prospection : règles pures (stratégie, offre, entonnoir,
// objectif de la semaine, import). Aucune lecture de base ici : tout est testé
// dans lib/crm-model.test.ts. Les quatre stratégies sont décrites pour les
// humains dans docs/strategie/prospection-bruxelles.md — un changement ici se
// reporte là-bas.

import { BRUSSELS_POSTAL_CODES, isBrussels } from "./audit/brussels";

export const CRM_STATUSES = ["a_qualifier", "a_contacter", "contacte", "rdv_audit", "audit_presente", "signe", "perdu"] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];

export const CRM_STATUS_LABEL: Record<CrmStatus, string> = {
  a_qualifier: "À qualifier",
  a_contacter: "À contacter",
  contacte: "Contacté",
  rdv_audit: "RDV audit",
  audit_presente: "Audit présenté",
  signe: "Signé",
  perdu: "Perdu",
};

export const CRM_STRATEGIES = ["pilier", "reputation", "jeune", "enseigne"] as const;
export type CrmStrategy = (typeof CRM_STRATEGIES)[number];

export const CRM_OFFERS = ["gratuit", "pro_2_mois"] as const;
export type CrmOffer = (typeof CRM_OFFERS)[number];

export const CRM_OFFER_LABEL: Record<CrmOffer, string> = {
  gratuit: "Démarrer gratuitement",
  pro_2_mois: "2 mois Pro offerts",
};

export const CRM_EVENT_KINDS = ["statut", "appel", "whatsapp", "email", "visite", "note"] as const;
export type CrmEventKind = (typeof CRM_EVENT_KINDS)[number];

export interface StrategyDef {
  key: CrmStrategy;
  label: string;
  /** Qui est concerné, en une ligne (critères de suggestion). */
  who: string;
  offer: CrmOffer;
  /** L'angle d'ouverture : ce qu'on montre à l'audit. */
  angle: string;
}

export const STRATEGIES: Record<CrmStrategy, StrategyDef> = {
  pilier: {
    key: "pilier",
    label: "Pilier du quartier",
    who: "1 site, note ≥ 4,3 et ≥ 300 avis : une clientèle d'habitués qu'il ne connaît pas",
    offer: "gratuit",
    angle: "Vos habitués repartent sans laisser de contact : on les inscrit, vous les relancez.",
  },
  reputation: {
    key: "reputation",
    label: "Réputation à reprendre",
    who: "Note < 4,3, avis sans réponse ou plaintes récurrentes",
    offer: "gratuit",
    angle: "L'audit montre ce que disent les avis ; le retour privé et la demande d'avis à tous font remonter la note.",
  },
  jeune: {
    key: "jeune",
    label: "Jeune adresse qui veut décoller",
    who: "Ouvert depuis moins de 2 ans ou < 300 avis, actif sur Instagram",
    offer: "pro_2_mois",
    angle: "Construire la base clients dès maintenant et être trouvé sur Google : on s'en occupe deux mois.",
  },
  enseigne: {
    key: "enseigne",
    label: "Enseigne en croissance",
    who: "2 à 5 sites, ou ventes très dépendantes d'Uber Eats / Deliveroo",
    offer: "pro_2_mois",
    angle: "Une base clients par site, une vue d'ensemble et des clients qui reviennent sans commission.",
  },
};

export interface StrategyInput {
  locations?: number | null;
  rating?: number | null;
  reviewsCount?: number | null;
  openedYear?: number | null;
  delivery?: string[] | null;
  signals?: string[] | null;
}

const COMPLAINT = /sans r[ée]ponse|aucune r[ée]ponse|plainte|en baisse|attente|n[ée]gatif/i;
const DELIVERY_HEAVY = /d[ée]pend|surtout (en )?livraison|majorit/i;

/**
 * Stratégie suggérée, dans l'ordre de priorité : une enseigne reste une
 * enseigne même mal notée (le décideur et l'offre changent) ; une réputation
 * abîmée passe avant la jeunesse (on ne fait pas venir du monde vers une fiche
 * qui repousse). Sans donnée, « pilier » — la stratégie qui ne promet rien
 * d'autre que le plan Gratuit.
 */
export function suggestStrategy(p: StrategyInput, year = new Date().getFullYear()): CrmStrategy {
  const signals = p.signals ?? [];
  if ((p.locations ?? 1) >= 2) return "enseigne";
  if ((p.delivery?.length ?? 0) > 0 && signals.some((s) => DELIVERY_HEAVY.test(s))) return "enseigne";
  if ((p.rating != null && p.rating < 4.3) || signals.some((s) => COMPLAINT.test(s))) return "reputation";
  if ((p.openedYear != null && year - p.openedYear < 2) || (p.reviewsCount != null && p.reviewsCount < 300)) return "jeune";
  return "pilier";
}

// ─── Objectif de la semaine ────────────────────────────────────────────────────

/** 5 établissements signés par semaine (objectif des associés, 2026-10-03). */
export const WEEKLY_SIGNED_TARGET = 5;

/**
 * Taux de départ pour dimensionner l'entonnoir — HYPOTHÈSES, remplacées par
 * les taux mesurés dès qu'il y a assez d'événements (`measuredRates`).
 * contact → RDV audit 25 %, RDV → audit présenté 80 %, audit présenté → signé 50 %.
 */
export const DEFAULT_RATES = { contactToRdv: 0.25, rdvToAudit: 0.8, auditToSigned: 0.5 };
/** En dessous de ce nombre d'observations, un taux mesuré n'est pas fiable. */
export const MIN_SAMPLE = 10;

export type Rates = typeof DEFAULT_RATES;

/** Ce qu'il faut faire en une semaine pour signer `target` établissements. */
export function weeklyPlan(rates: Rates, target = WEEKLY_SIGNED_TARGET) {
  const audits = Math.ceil(target / Math.max(rates.auditToSigned, 0.01));
  const rdv = Math.ceil(audits / Math.max(rates.rdvToAudit, 0.01));
  const contacts = Math.ceil(rdv / Math.max(rates.contactToRdv, 0.01));
  return { signed: target, audits, rdv, contacts };
}

export interface StatusEvent {
  prospect_id: string;
  to_status: string | null;
  created_at: string;
}

/** Lundi 00:00 (heure de Bruxelles approchée par l'heure locale du serveur, UTC sur Vercel) de la semaine de `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // lundi = 0
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

const REACHED: Record<"contacts" | "rdv" | "audits" | "signed", CrmStatus[]> = {
  contacts: ["contacte"],
  rdv: ["rdv_audit"],
  audits: ["audit_presente"],
  signed: ["signe"],
};

/** Prospects distincts arrivés à chaque étape pendant la semaine qui commence à `from`. */
export function weekCounts(events: StatusEvent[], from: Date) {
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const out = { contacts: 0, rdv: 0, audits: 0, signed: 0 };
  for (const k of Object.keys(REACHED) as (keyof typeof REACHED)[]) {
    const ids = new Set<string>();
    for (const e of events) {
      const t = new Date(e.created_at);
      if (t >= from && t < to && REACHED[k].includes(e.to_status as CrmStatus)) ids.add(e.prospect_id);
    }
    out[k] = ids.size;
  }
  return out;
}

/**
 * Taux mesurés sur tout l'historique : parmi les prospects arrivés à une
 * étape, combien ont atteint la suivante. Un taux sans `MIN_SAMPLE`
 * observations garde l'hypothèse de départ, et le dit (`measured`).
 */
export function measuredRates(events: StatusEvent[]): { rates: Rates; measured: Record<keyof Rates, boolean>; samples: Record<keyof Rates, number> } {
  const reached = (s: CrmStatus) => new Set(events.filter((e) => e.to_status === s).map((e) => e.prospect_id));
  const contacted = reached("contacte");
  const rdv = reached("rdv_audit");
  const audit = reached("audit_presente");
  const signed = reached("signe");
  // Un prospect signé sans passer par les étapes intermédiaires les a quand
  // même franchies : on remonte l'entonnoir pour ne pas gonfler les taux.
  for (const id of signed) audit.add(id);
  for (const id of audit) rdv.add(id);
  for (const id of rdv) contacted.add(id);

  const ratio = (num: Set<string>, den: Set<string>) => {
    let n = 0;
    for (const id of den) if (num.has(id)) n++;
    return { value: den.size ? n / den.size : 0, sample: den.size };
  };
  const pairs: [keyof Rates, ReturnType<typeof ratio>][] = [
    ["contactToRdv", ratio(rdv, contacted)],
    ["rdvToAudit", ratio(audit, rdv)],
    ["auditToSigned", ratio(signed, audit)],
  ];
  const rates = { ...DEFAULT_RATES };
  const measured = { contactToRdv: false, rdvToAudit: false, auditToSigned: false };
  const samples = { contactToRdv: 0, rdvToAudit: 0, auditToSigned: 0 };
  for (const [k, r] of pairs) {
    samples[k] = r.sample;
    if (r.sample >= MIN_SAMPLE && r.value > 0) {
      rates[k] = r.value;
      measured[k] = true;
    }
  }
  return { rates, measured, samples };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/** Numéro belge publié → format international pour wa.me / tel:. Null si illisible. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (d.startsWith("0")) d = `+32${d.slice(1)}`;
  if (!d.startsWith("+")) d = `+${d}`;
  return /^\+\d{8,15}$/.test(d) ? d : null;
}

/** Un mobile belge (04xx) peut recevoir un WhatsApp ; un fixe (02…) non. */
export function isBelgianMobile(e164: string | null): boolean {
  return !!e164 && /^\+324\d{8}$/.test(e164);
}

/** Message d'ouverture par défaut : la proposition d'audit, jamais une promesse chiffrée. */
export function defaultPitch(p: { name: string; strategy: CrmStrategy; ownerName?: string | null }): string {
  const hello = p.ownerName ? `Bonjour ${p.ownerName.split(/\s+/)[0]},` : "Bonjour,";
  const hook: Record<CrmStrategy, string> = {
    pilier: `vos clients reviennent chez ${p.name}, mais vous ne pouvez pas les recontacter.`,
    reputation: `j'ai regardé les avis Google de ${p.name} : il y a des choses simples à corriger.`,
    jeune: `${p.name} a démarré fort ; c'est le bon moment pour construire votre base clients.`,
    enseigne: `avec plusieurs adresses, ${p.name} a une base clients à réunir et à faire revenir.`,
  };
  return `${hello} ${hook[p.strategy]} Je vous propose un audit gratuit de votre restaurant (fiche Google, avis, concurrents) et on en parle quand vous voulez — 20 minutes sur place.`;
}

// ─── Import ───────────────────────────────────────────────────────────────────

export interface ProspectInput {
  name: string;
  address: string | null;
  postal_code: string | null;
  commune: string | null;
  category: string | null;
  locations: number;
  opened_year: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  delivery: string[];
  rating: number | null;
  reviews_count: number | null;
  owner_name: string | null;
  owner_role: string | null;
  owner_contact: string | null;
  company_number: string | null;
  signals: string[];
  sources: string[];
  strategy: CrmStrategy;
  offer: CrmOffer;
  pitch: string | null;
}

const str = (v: unknown, max = 300): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const list = (v: unknown, max = 12): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, 400)).filter((x): x is string => !!x).slice(0, max) : [];
const url = (v: unknown): string | null => {
  const s = str(v, 400);
  return s && /^https?:\/\//i.test(s) ? s : null;
};
const email = (v: unknown): string | null => {
  const s = str(v, 200);
  return s && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s) ? s.toLowerCase() : null;
};

/**
 * Une ligne d'import (JSON collé dans la console) → prospect propre, ou la
 * raison du refus. Rien n'est complété ni deviné : un champ illisible reste
 * vide. La stratégie et l'offre fournies priment ; sinon elles se déduisent.
 */
export function normalizeProspect(raw: unknown): { ok: true; value: ProspectInput } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "ligne illisible" };
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 120);
  if (!name) return { ok: false, reason: "nom manquant" };
  const postal = str(r.postal_code, 4);
  if (postal && !isBrussels(postal)) return { ok: false, reason: `${name} : code postal hors Bruxelles (${postal})` };

  const locations = Math.min(Math.max(Math.round(num(r.locations) ?? 1), 1), 50);
  const rating = num(r.rating);
  const reviews = num(r.reviews_count);
  const opened = num(r.opened_year);
  const delivery = list(r.delivery, 5).map((d) => d.toLowerCase());
  const signals = list(r.signals, 6);
  const input: StrategyInput = { locations, rating, reviewsCount: reviews, openedYear: opened, delivery, signals };

  const strategy = CRM_STRATEGIES.includes(r.strategy as CrmStrategy) ? (r.strategy as CrmStrategy) : suggestStrategy(input);
  const offer = CRM_OFFERS.includes(r.offer as CrmOffer) ? (r.offer as CrmOffer) : STRATEGIES[strategy].offer;
  const owner = str(r.owner_name, 120);

  return {
    ok: true,
    value: {
      name,
      address: str(r.address, 200),
      postal_code: postal,
      commune: str(r.commune, 60),
      category: str(r.category, 80),
      locations,
      opened_year: opened != null && opened > 1900 && opened < 2100 ? Math.round(opened) : null,
      phone: str(r.phone, 40),
      email: email(r.email),
      website: url(r.website),
      instagram: url(r.instagram),
      facebook: url(r.facebook),
      delivery,
      rating: rating != null && rating >= 1 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
      reviews_count: reviews != null && reviews >= 0 ? Math.round(reviews) : null,
      owner_name: owner,
      owner_role: str(r.owner_role, 80),
      owner_contact: str(r.owner_contact, 200),
      company_number: str(r.company_number, 20),
      signals,
      sources: list(r.sources, 12).filter((s) => /^https?:\/\//i.test(s)),
      strategy,
      offer,
      pitch: str(r.pitch, 600) ?? defaultPitch({ name, strategy, ownerName: owner }),
    },
  };
}

// ─── Découverte Google Maps ───────────────────────────────────────────────────

/**
 * Chaînes et franchises hors cible (positionnement §2) — la décision se prend
 * au siège, pas au comptoir. Belchicken est traité par son siège (point
 * d'entrée réseau), jamais établissement par établissement.
 */
const CHAINS = /\b(mc ?donald'?s|quick|burger king|kfc|domino'?s|pizza hut|exki|pain quotidien|panos|subway|starbucks|five guys|o'?tacos|belchicken|poke house|pokawa|ellis|balls ?& ?glory|manhattn'?s|class'?croute|lunch garden|delitraiteur|carrefour|delhaize|colruyt|paul|la croissanterie|chick'?n ?time|tasty crousty|sushi shop|wasabi|vapiano|amorino)\b/i;

export function isChain(name: string): boolean {
  return CHAINS.test(name);
}

/** Types Google qui correspondent à la cible (restauration rapide, à emporter, casual). */
const TARGET_TYPES = new Set([
  "fast_food_restaurant", "hamburger_restaurant", "pizza_restaurant", "sandwich_shop", "meal_takeaway",
  "chicken_restaurant", "kebab_shop", "mexican_restaurant", "turkish_restaurant", "lebanese_restaurant",
  "greek_restaurant", "middle_eastern_restaurant", "bagel_shop", "brunch_restaurant", "breakfast_restaurant",
  "cafe", "ramen_restaurant", "korean_restaurant", "vietnamese_restaurant", "thai_restaurant", "asian_restaurant",
  "vegan_restaurant", "salad_shop", "restaurant",
]);

/** En dessous, la fiche est trop peu active pour qu'un audit ait de la matière. */
export const MIN_REVIEWS_FOR_DISCOVERY = 50;

export type DiscoveryRejection = "hors_bruxelles" | "chaine" | "type" | "peu_d_avis";

export interface PlaceLike {
  id: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  locality: string | null;
  rating: number | null;
  reviewsCount: number | null;
  website: string | null;
  phone: string | null;
  primaryType: string | null;
  category: string | null;
  types: string[];
  mapsUri: string | null;
}

/** Pourquoi une fiche Google n'entre pas dans le CRM, ou null si elle entre. Chaque refus est compté. */
export function discoveryRejection(p: PlaceLike): DiscoveryRejection | null {
  if (!isBrussels(p.postalCode)) return "hors_bruxelles";
  if (isChain(p.name)) return "chaine";
  const types = [p.primaryType, ...p.types].filter(Boolean) as string[];
  if (!types.some((t) => TARGET_TYPES.has(t))) return "type";
  if ((p.reviewsCount ?? 0) < MIN_REVIEWS_FOR_DISCOVERY) return "peu_d_avis";
  return null;
}

/** Fiche Google → prospect « à qualifier » (le gérant et l'e-mail restent à trouver à la main). */
export function prospectFromPlace(p: PlaceLike): ProspectInput & { place_id: string; maps_uri: string | null } {
  const strategy = suggestStrategy({ locations: 1, rating: p.rating, reviewsCount: p.reviewsCount });
  const commune = (p.postalCode && BRUSSELS_POSTAL_CODES[p.postalCode]) || p.locality;
  return {
    name: p.name.slice(0, 120),
    address: p.address,
    postal_code: p.postalCode,
    commune: commune ?? null,
    category: p.category,
    locations: 1,
    opened_year: null,
    phone: p.phone,
    email: null,
    website: p.website,
    instagram: null,
    facebook: null,
    delivery: [],
    rating: p.rating,
    reviews_count: p.reviewsCount,
    owner_name: null,
    owner_role: null,
    owner_contact: null,
    company_number: null,
    signals: [],
    sources: p.mapsUri ? [p.mapsUri] : [],
    strategy,
    offer: STRATEGIES[strategy].offer,
    pitch: defaultPitch({ name: p.name, strategy }),
    place_id: p.id,
    maps_uri: p.mapsUri,
  };
}
