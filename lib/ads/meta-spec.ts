import type { Objective } from "./objectives";
import { MIN_BUDGET_CENTS } from "./money";

// ADR 0086 §1, §6, §7 — ce qu'une demande de pub devient chez Meta, et ce que
// Meta renvoie devient pour le restaurateur. Module PUR et testé : aucun appel
// réseau ici (lib/ads/meta-api.ts les fait).

/** Objectifs ouverts au restaurateur (décision du porteur, 2026-10-23). Les autres restent lus et rattachés. */
export const OPEN_OBJECTIVES = ["TRAFIC", "NOTORIETE", "VIDEO"] as const satisfies readonly Objective[];
export type OpenObjective = (typeof OPEN_OBJECTIVES)[number];

export function isOpenObjective(s: string): s is OpenObjective {
  return (OPEN_OBJECTIVES as readonly string[]).includes(s);
}

/** Rayons proposés autour du restaurant, en km. */
export const RADII_KM = [1, 3, 5, 10] as const;
/** Durée maximale d'une campagne demandée depuis la console. */
export const MAX_DAYS = 90;

export type MetaObjectiveSpec = {
  campaignObjective: "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT";
  optimizationGoal: "LINK_CLICKS" | "REACH" | "THRUPLAY";
  billingEvent: "IMPRESSIONS";
  destinationType: "WEBSITE" | "ON_VIDEO" | null;
  /** La publicité porte un lien (bouton) vers le restaurant. */
  needsLink: boolean;
  /** Seule une vidéo convient. */
  needsVideo: boolean;
};

export const META_SPEC: Record<OpenObjective, MetaObjectiveSpec> = {
  TRAFIC: { campaignObjective: "OUTCOME_TRAFFIC", optimizationGoal: "LINK_CLICKS", billingEvent: "IMPRESSIONS", destinationType: "WEBSITE", needsLink: true, needsVideo: false },
  NOTORIETE: { campaignObjective: "OUTCOME_AWARENESS", optimizationGoal: "REACH", billingEvent: "IMPRESSIONS", destinationType: null, needsLink: false, needsVideo: false },
  VIDEO: { campaignObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "THRUPLAY", billingEvent: "IMPRESSIONS", destinationType: "ON_VIDEO", needsLink: false, needsVideo: true },
};

// ── Ciblage et budget ────────────────────────────────────────

/** Tous les âges, réglage fixe (porteur, 2026-10-23) : Meta optimise seul dans la zone. */
export function buildTargeting(p: { lat: number; lng: number; radiusKm: number }) {
  return {
    geo_locations: {
      custom_locations: [{ latitude: p.lat, longitude: p.lng, radius: p.radiusKm, distance_unit: "kilometer" }],
      location_types: ["home", "recent"],
    },
    age_min: 18,
    age_max: 65,
    publisher_platforms: ["facebook", "instagram"],
    targeting_automation: { advantage_audience: 0 },
  };
}

/** Jours de diffusion, bornes comprises ; dates « AAAA-MM-JJ ». */
export function dayCount(startsOn: string, endsOn: string): number {
  const ms = Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Budget par jour posé sur l'ensemble : le budget réparti sur la période, arrondi vers le bas. */
export function dailyBudgetCents(budgetCents: number, startsOn: string, endsOn: string): number {
  return Math.floor(budgetCents / Math.max(1, dayCount(startsOn, endsOn)));
}

/** Début et fin de diffusion chez Meta, heure de Bruxelles (fin = 23:59 du dernier jour). */
export function metaTimes(startsOn: string, endsOn: string): { start_time: string; end_time: string } {
  return { start_time: `${startsOn}T00:00:00${brusselsOffset(startsOn)}`, end_time: `${endsOn}T23:59:00${brusselsOffset(endsOn)}` };
}

/** Décalage de Bruxelles ce jour-là (« +0100 » l'hiver, « +0200 » l'été), lu à midi UTC. */
export function brusselsOffset(day: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Brussels", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${day}T12:00:00Z`))
    .find((x) => x.type === "timeZoneName")?.value;
  return part === "GMT+2" ? "+0200" : "+0100";
}

// ── La demande du restaurateur ───────────────────────────────

export type RequestIssue =
  | "objective"
  | "budget"
  | "dates"
  | "start_past"
  | "too_long"
  | "radius"
  | "text"
  | "creative"
  | "needs_video"
  | "billing_name"
  | "billing_vat"
  | "billing_address"
  | "terms";

export const REQUEST_ISSUE_TEXT: Record<RequestIssue, string> = {
  objective: "Choisis ce que tu veux obtenir.",
  budget: "Le budget minimum est de 100 €, en euros ronds.",
  dates: "La date de fin doit suivre la date de début.",
  start_past: "La pub ne peut pas commencer avant demain.",
  too_long: `Une pub dure au plus ${MAX_DAYS} jours.`,
  radius: "Choisis une zone autour du resto.",
  text: "Écris le texte de ta pub (500 caractères au plus).",
  creative: "Choisis une publication Instagram ou envoie une photo ou une vidéo.",
  needs_video: "Pour faire voir une vidéo, choisis une vidéo.",
  billing_name: "Indique la raison sociale à mettre sur la facture.",
  billing_vat: "Le numéro de TVA a la forme BE0123456789.",
  billing_address: "Indique l'adresse de facturation.",
  terms: "Accepte les conditions de la Pub pour continuer.",
};

export type Creative =
  | { kind: "instagram_post"; mediaId: string; mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"; permalink: string | null; thumbnail: string | null }
  | { kind: "upload"; path: string; mime: string };

export type RequestInput = {
  objective: OpenObjective;
  budgetCents: number;
  startsOn: string;
  endsOn: string;
  radiusKm: number;
  adText: string;
  creative: Creative;
  billing: { legalName: string; vatNumber: string | null; address: string };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** « BE 0123.456.789 » → « BE0123456789 » ; null si vide. */
export function normalizeVat(s: string): string | null {
  const v = s.toUpperCase().replace(/[\s.\-]/g, "");
  return v ? v : null;
}

function creativeIsVideo(c: Creative): boolean {
  return c.kind === "instagram_post" ? c.mediaType === "VIDEO" : c.mime.startsWith("video/");
}

/** Le texte et la création seuls — rejugés aussi quand le restaurateur corrige après « Renvoyer ». */
export function judgeContent(objective: OpenObjective, rawText: unknown, rawCreative: unknown): { ok: true; adText: string; creative: Creative } | { ok: false; issue: RequestIssue } {
  const adText = String(rawText ?? "").trim();
  if (adText.length < 2 || adText.length > 500) return { ok: false, issue: "text" };
  const c = rawCreative && typeof rawCreative === "object" ? (rawCreative as Record<string, unknown>) : null;
  let creative: Creative;
  if (c?.kind === "instagram_post" && typeof c.mediaId === "string" && /^\d{5,25}$/.test(c.mediaId)) {
    const mediaType = c.mediaType === "VIDEO" || c.mediaType === "CAROUSEL_ALBUM" ? c.mediaType : "IMAGE";
    creative = { kind: "instagram_post", mediaId: c.mediaId, mediaType, permalink: typeof c.permalink === "string" ? c.permalink : null, thumbnail: typeof c.thumbnail === "string" ? c.thumbnail : null };
  } else if (c?.kind === "upload" && typeof c.path === "string" && typeof c.mime === "string" && /^(image|video)\//.test(c.mime)) {
    creative = { kind: "upload", path: c.path, mime: c.mime };
  } else {
    return { ok: false, issue: "creative" };
  }
  if (META_SPEC[objective].needsVideo && !creativeIsVideo(creative)) return { ok: false, issue: "needs_video" };
  return { ok: true, adText, creative };
}

/**
 * Juge une demande venue du formulaire. `today` = date de Bruxelles du jour ;
 * une pub commence au plus tôt le lendemain (le temps du virement et de la vérification).
 */
export function judgeRequest(raw: Record<string, unknown>, today: string): { ok: true; input: RequestInput } | { ok: false; issue: RequestIssue } {
  const objective = String(raw.objective ?? "");
  if (!isOpenObjective(objective)) return { ok: false, issue: "objective" };

  const euros = Number(raw.budgetEuros);
  if (!Number.isInteger(euros) || euros * 100 < MIN_BUDGET_CENTS || euros > 100_000) return { ok: false, issue: "budget" };

  const startsOn = String(raw.startsOn ?? "");
  const endsOn = String(raw.endsOn ?? "");
  if (!DATE.test(startsOn) || !DATE.test(endsOn) || endsOn < startsOn) return { ok: false, issue: "dates" };
  if (startsOn <= today) return { ok: false, issue: "start_past" };
  if (dayCount(startsOn, endsOn) > MAX_DAYS) return { ok: false, issue: "too_long" };

  const radiusKm = Number(raw.radiusKm);
  if (!(RADII_KM as readonly number[]).includes(radiusKm)) return { ok: false, issue: "radius" };

  const content = judgeContent(objective, raw.adText, raw.creative);
  if (!content.ok) return content;
  const { adText, creative } = content;

  const b = raw.billing && typeof raw.billing === "object" ? (raw.billing as Record<string, unknown>) : {};
  const legalName = String(b.legalName ?? "").trim();
  const address = String(b.address ?? "").trim();
  const vatNumber = normalizeVat(String(b.vatNumber ?? ""));
  if (legalName.length < 2 || legalName.length > 160) return { ok: false, issue: "billing_name" };
  if (vatNumber !== null && !/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(vatNumber)) return { ok: false, issue: "billing_vat" };
  if (address.length < 5 || address.length > 300) return { ok: false, issue: "billing_address" };

  if (raw.termsAccepted !== true) return { ok: false, issue: "terms" };

  return { ok: true, input: { objective, budgetCents: euros * 100, startsOn, endsOn, radiusKm, adText, creative, billing: { legalName, vatNumber, address } } };
}

// ── Ce que Meta renvoie ──────────────────────────────────────

export type InsightRow = {
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  video_thruplay_watched_actions?: { action_type: string; value: string }[];
};

export type DayStat = { day: string; spendCents: number; impressions: number; reach: number; clicks: number; results: number; resultKind: string | null };

const int = (s: string | undefined) => (s ? Math.round(Number(s)) || 0 : 0);
const sumActions = (a: InsightRow["actions"], types: string[]) =>
  (a ?? []).filter((x) => types.includes(x.action_type)).reduce((n, x) => n + int(x.value), 0);

/** Une ligne d'insights (un jour, une campagne) → nos colonnes ; le résultat suit l'objectif (ADR 0086 §7). */
export function dayStatFromInsight(row: InsightRow, objective: string | null): DayStat {
  const base = {
    day: row.date_start,
    spendCents: Math.round(Number(row.spend ?? "0") * 100) || 0,
    impressions: int(row.impressions),
    reach: int(row.reach),
    clicks: int(row.inline_link_clicks ?? row.clicks),
  };
  switch (objective) {
    case "TRAFIC":
    case "UBEREATS":
    case "DELIVEROO":
    case "TAKEAWAY":
    case "INSCRIPTION":
      return { ...base, results: int(row.inline_link_clicks) || sumActions(row.actions, ["link_click"]), resultKind: "clics" };
    case "NOTORIETE":
      return { ...base, results: base.reach, resultKind: "personnes touchées" };
    case "VIDEO":
      return { ...base, results: sumActions(row.video_thruplay_watched_actions, ["video_view"]) || sumActions(row.actions, ["video_view"]), resultKind: "vues" };
    case "MESSAGES":
      return { ...base, results: sumActions(row.actions, ["onsite_conversion.messaging_conversation_started_7d"]), resultKind: "conversations" };
    default:
      return { ...base, results: 0, resultKind: null };
  }
}

export type RequestStatus = "paiement_attendu" | "payee" | "preparee" | "a_corriger" | "en_diffusion" | "en_pause" | "terminee" | "annulee";

/**
 * L'état d'une demande lancée, déduit de Meta. Avant le lancement, rien ne change ici :
 * ce sont les gestes de Mehdi qui font avancer. Une campagne arrêtée sur son plafond
 * (à 1 € près) ou après sa date de fin est terminée.
 */
export function statusFromMeta(p: {
  current: RequestStatus;
  effectiveStatus: string | null;
  spentCents: number;
  capCents: number | null;
  endsOn: string | null;
  today: string;
}): RequestStatus {
  if (p.current !== "en_diffusion" && p.current !== "en_pause") return p.current;
  if (p.capCents !== null && p.spentCents >= p.capCents - 100) return "terminee";
  if (p.endsOn !== null && p.today > p.endsOn) return "terminee";
  if (p.effectiveStatus === "ACTIVE" || p.effectiveStatus === "IN_PROCESS" || p.effectiveStatus === "WITH_ISSUES") return "en_diffusion";
  if (p.effectiveStatus && /PAUSED|ARCHIVED|DELETED/.test(p.effectiveStatus)) return "en_pause";
  return p.current;
}

// ── Les publications Instagram du restaurateur ───────────────

export type IgMedia = {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  like_count?: number;
  comments_count?: number;
  timestamp: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  caption?: string;
};

/**
 * Les publications au meilleur potentiel (ADR 0086 §6) : J'aime + commentaires (un
 * commentaire vaut deux J'aime), atténués avec l'âge (moitié à 90 jours), vidéos d'abord.
 */
export function rankInstagramPosts(media: readonly IgMedia[], now: Date, limit = 9): IgMedia[] {
  const score = (m: IgMedia) => {
    const engagement = (m.like_count ?? 0) + 2 * (m.comments_count ?? 0) + 1;
    const ageDays = Math.max(0, (now.getTime() - Date.parse(m.timestamp)) / 86_400_000);
    const format = m.media_type === "VIDEO" ? 1.5 : 1;
    return (engagement * format) / (1 + ageDays / 90);
  };
  return [...media].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

// ── Le virement ──────────────────────────────────────────────

/**
 * Contenu du QR de paiement EPC (« BCD », version 002, SEPA). La communication
 * structurée belge va dans la ligne libre : les applis bancaires belges la reconnaissent.
 */
export function epcPayload(p: { bic: string; holder: string; iban: string; amountCents: number; communication: string }): string {
  const amount = `EUR${Math.floor(p.amountCents / 100)}.${String(p.amountCents % 100).padStart(2, "0")}`;
  return ["BCD", "002", "1", "SCT", p.bic, p.holder.slice(0, 70), p.iban, amount, "", "", p.communication].join("\n");
}
