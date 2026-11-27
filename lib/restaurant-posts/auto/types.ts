// ADR 0112 — les articles publiés automatiquement : les formes partagées par la logique, la console et la tâche
// planifiée. PUR : aucun import serveur.

/** Les types d'occasion, DANS L'ORDRE de priorité quand deux tombent le même jour. */
export const AUTO_KINDS = ["promo", "evenement", "match", "meteo"] as const;
export type AutoKind = (typeof AUTO_KINDS)[number];
export const isAutoKind = (v: unknown): v is AutoKind => typeof v === "string" && (AUTO_KINDS as readonly string[]).includes(v);
export const priorityOf = (kind: AutoKind): number => AUTO_KINDS.indexOf(kind);

export const KIND_LABEL: Record<AutoKind, string> = {
  promo: "Mes promos",
  evenement: "Concerts, brocantes, fêtes près de chez moi",
  match: "Matchs",
  meteo: "Soleil et pluie",
};

/** La phrase qu'on accepte en activant. La changer oblige à changer `TERMS_VERSION`. */
export const ACCEPTANCE_TEXT =
  "J'accepte que ces articles soient publiés au nom de mon restaurant sans mon accord un par un. J'en réponds.";
export const TERMS_VERSION = "2026-11-26";

/** Heures de Bruxelles : on prévient la veille, on publie le jour même. */
export const NOTIFY_HOUR = 17;
export const PUBLISH_HOUR = 10;
export const MAX_PER_DAY = 1;
export const MAX_PER_WEEK = 3;
/** On prépare les trois prochains jours : demain est prévenu ce soir, les suivants s'affichent « bientôt ». */
export const HORIZON_DAYS = 3;

export type AutoSettings = {
  restaurant_id: string;
  enabled: boolean;
  kinds: AutoKind[];
  accepted_by: string | null;
  accepted_at: string | null;
  terms_version: string | null;
  disabled_by: string | null;
  disabled_at: string | null;
  updated_at: string;
};

// ─── Les faits d'une occasion : tout ce qu'un article automatique sait, et rien d'autre. ───

export const EVENT_CATEGORIES = ["concert", "festival", "fete", "brocante", "foire"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type EventFacts = {
  kind: "evenement";
  source: string;
  externalId: string;
  eventId: string;
  /** Nom donné par un tiers : déjà nettoyé et limité. */
  name: string;
  category: EventCategory;
  day: string;
  /** Mètres, arrondis. */
  distanceM: number;
};

export type MatchFacts = {
  kind: "match";
  matchId: number;
  home: string;
  away: string;
  competition: string;
  kickoffUtc: string;
  day: string;
};

export type WeatherFacts = { kind: "meteo"; sky: "soleil" | "pluie"; service: "midi" | "soir"; day: string };

/** Le contrat des promos, à brancher sur les offres (ADR 0110) quand elles existeront. */
export type PromoFacts = { kind: "promo"; offerId: string; label: string; day: string; endsDay: string };

export type Facts = EventFacts | MatchFacts | WeatherFacts | PromoFacts;

/** Une occasion trouvée par une source, avec les jours où son article peut paraître. */
export type Candidate = {
  kind: AutoKind;
  sourceKey: string;
  /** À type égal et même jour, le plus petit passe devant (la distance, par exemple). */
  rank: number;
  /** Jours possibles, du plus tôt au plus tard. */
  days: { day: string; expiresAt: string; facts: Facts }[];
};

export type OccasionStatus = "prevu" | "prevenu" | "publie" | "refuse" | "ecarte";
export const PENDING_STATUSES: readonly OccasionStatus[] = ["prevu", "prevenu"];
/** Les états qui occupent un jour et comptent dans la semaine. */
export const ACTIVE_STATUSES: readonly OccasionStatus[] = ["prevu", "prevenu", "publie"];

export type Occasion = {
  id: string;
  restaurant_id: string;
  kind: AutoKind;
  source_key: string;
  label: string;
  title: string;
  facts: Facts;
  occasion_day: string;
  publish_day: string;
  publish_at: string;
  expires_at: string;
  variant: number;
  status: OccasionStatus;
  reason: string | null;
  reason_detail: string | null;
  post_id: string | null;
  send_id: string | null;
  notified_at: string | null;
  published_at: string | null;
  published_mode: "auto" | "maintenant" | null;
  modified_at: string | null;
  refused_via: "lien" | "console" | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * « Ce que tu proposes ». Une information fausse ou absente vaut `false` : un article ne parle que de ce qui est coché.
 */
export type Offerings = { terrace: boolean; onSite: boolean; screen: boolean };
