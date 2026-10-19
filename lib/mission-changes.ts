// ============================================================
// Réserver un prestataire (ADR 0084 §3 règle 9) — la demande de modification.
//
// Le brief est verrouillé à l'envoi : tout changement ensuite est une DEMANDE DE MODIFICATION que le prestataire
// chiffre (un supplément, éventuellement nul) ou refuse. Le restaurateur accepte ou non le supplément ; refus ou
// silence : le brief d'origine tient. Une seule demande à la fois, deux au total (celles que le prestataire refuse
// ou laisse expirer ne comptent pas). Jusqu'à J-7 du tournage : au-delà, l'équipe est prévenue et le prestataire
// s'est organisé. Fonctions PURES : le jour belge est injecté.
// ============================================================

import { addDays } from "./console-journey";
import { SHOOT_MIN_DAYS } from "./mission-brief";
import { changeableStatuses } from "./mission-metier";
import type { Metier } from "./mission-money";

export const CHANGE_CATEGORIES = ["Plats à montrer", "Cuisine ou salle", "Ton et style", "Format ou durée", "Personnes à l'image", "Autre"] as const;
export const MAX_CHANGES = 2;
export const DESCRIPTION_MIN = 30;
export const DESCRIPTION_MAX = 1_000;
export const MAX_SUPPLEMENT_CENTS = 500_000; // 5 000 €
export const MAX_DELTA_DAYS = 30;
export const NOTE_MAX = 500;
export const REASON_MIN = 12;
export const REASON_MAX = 500;
/** Un prestataire qui ne répond pas dans ce délai : la demande expire, le brief d'origine tient. */
export const PROVIDER_ANSWER_DAYS = 3;

export type ChangeStatus = "proposed" | "quoted" | "accepted" | "declined_by_provider" | "declined_by_restaurant" | "withdrawn" | "expired";
export const OPEN_STATUSES: readonly ChangeStatus[] = ["proposed", "quoted"];

export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  proposed: "En attente du prestataire",
  quoted: "Supplément proposé",
  accepted: "Acceptée",
  declined_by_provider: "Refusée par le prestataire",
  declined_by_restaurant: "Supplément refusé",
  withdrawn: "Retirée",
  expired: "Sans réponse : le brief d'origine tient",
};

export type ChangeLite = { status: ChangeStatus };

/** Une demande compte dans la limite de deux, sauf si elle n'a pas abouti à cause du prestataire (refus, silence) ou si le restaurateur l'a retirée. */
export function countsTowardLimit(c: ChangeLite): boolean {
  return c.status === "proposed" || c.status === "quoted" || c.status === "accepted" || c.status === "declined_by_restaurant";
}

// ── La demande du restaurateur ───────────────────────────────

export type ChangeRequestInput = { categories: string[]; description: string; files: string[] };

export type RequestIssueCode = "no_category" | "unknown_category" | "description_missing" | "description_short" | "description_long";
export type RequestIssue = { field: "categories" | "description"; code: RequestIssueCode };

export function sanitizeChangeRequest(raw: unknown, files: string[] = []): ChangeRequestInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const cats = Array.isArray(o.categories) ? o.categories.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : [];
  return {
    categories: [...new Set(cats)].slice(0, CHANGE_CATEGORIES.length + 1),
    description: typeof o.description === "string" ? o.description.trim().slice(0, DESCRIPTION_MAX + 1) : "",
    files,
  };
}

export function validateChangeRequest(r: ChangeRequestInput): { ok: boolean; issues: RequestIssue[] } {
  const issues: RequestIssue[] = [];
  if (r.categories.length === 0) issues.push({ field: "categories", code: "no_category" });
  else if (r.categories.some((c) => !(CHANGE_CATEGORIES as readonly string[]).includes(c))) issues.push({ field: "categories", code: "unknown_category" });
  if (r.description.length === 0) issues.push({ field: "description", code: "description_missing" });
  else if (r.description.length < DESCRIPTION_MIN) issues.push({ field: "description", code: "description_short" });
  else if (r.description.length > DESCRIPTION_MAX) issues.push({ field: "description", code: "description_long" });
  return { ok: issues.length === 0, issues };
}

export const REQUEST_ISSUE_TEXT: Record<RequestIssueCode, string> = {
  no_category: "Choisis ce qui change : les plats, le ton, la durée…",
  unknown_category: "Une catégorie n'est pas reconnue.",
  description_missing: "Décris ce que tu veux changer.",
  description_short: "Un peu plus de détail : le prestataire doit pouvoir chiffrer sans t'appeler (30 caractères au moins).",
  description_long: "C'est trop long : va à l'essentiel (1 000 caractères au plus).",
};

export type RequestContext = { status: string; shootDate: string | null; changes: readonly ChangeLite[]; /** Absent : un métier de tournage. */ metier?: Metier };
export type RequestVerdict = "ok" | "not_now" | "too_late" | "open_exists" | "limit_reached";

/** Une modification se demande une fois le devis accepté, jusqu'à J-7 du tournage. */
export function judgeChangeRequest(c: RequestContext, today: string): RequestVerdict {
  if (!changeableStatuses(c.metier ?? "video").includes(c.status)) return "not_now";
  if (c.shootDate && today > addDays(c.shootDate, -SHOOT_MIN_DAYS)) return "too_late";
  if (c.changes.some((x) => OPEN_STATUSES.includes(x.status))) return "open_exists";
  if (c.changes.filter(countsTowardLimit).length >= MAX_CHANGES) return "limit_reached";
  return "ok";
}

export const REQUEST_VERDICT_TEXT: Record<Exclude<RequestVerdict, "ok">, string> = {
  not_now: "On ne peut pas demander de modification à ce stade.",
  too_late: "Il est trop tard : le tournage est dans moins de 7 jours, ton équipe est prévenue et le prestataire s'est organisé.",
  open_exists: "Une demande est déjà en cours : attends la réponse du prestataire.",
  limit_reached: "Tu as utilisé tes deux demandes de modification.",
};

// ── La réponse du prestataire ────────────────────────────────

export type ChangeQuoteInput = { free: boolean; priceCents: number; deltaDays: number; note: string };
export type QuoteIssueCode = "price_invalid" | "price_too_high" | "delta_invalid" | "note_too_long";
export type ChangeQuoteIssue = { field: "price" | "delta" | "note"; code: QuoteIssueCode };

export function sanitizeChangeQuote(raw: unknown): ChangeQuoteInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const free = o.free === true;
  return {
    free,
    priceCents: free ? 0 : typeof o.priceCents === "number" ? o.priceCents : Number.NaN,
    deltaDays: typeof o.deltaDays === "number" ? o.deltaDays : 0,
    note: typeof o.note === "string" ? o.note.trim().slice(0, NOTE_MAX + 1) : "",
  };
}

/** Un supplément chiffré (ou « sans supplément »), les jours de livraison en plus, un mot. */
export function validateChangeQuote(q: ChangeQuoteInput): { ok: boolean; issues: ChangeQuoteIssue[] } {
  const issues: ChangeQuoteIssue[] = [];
  if (!q.free) {
    if (!Number.isInteger(q.priceCents) || q.priceCents <= 0) issues.push({ field: "price", code: "price_invalid" });
    else if (q.priceCents > MAX_SUPPLEMENT_CENTS) issues.push({ field: "price", code: "price_too_high" });
  }
  if (!Number.isInteger(q.deltaDays) || q.deltaDays < 0 || q.deltaDays > MAX_DELTA_DAYS) issues.push({ field: "delta", code: "delta_invalid" });
  if (q.note.length > NOTE_MAX) issues.push({ field: "note", code: "note_too_long" });
  return { ok: issues.length === 0, issues };
}

export const QUOTE_ISSUE_TEXT: Record<QuoteIssueCode, string> = {
  price_invalid: "Indique ton supplément en euros, ou coche « sans supplément ».",
  price_too_high: "Ce supplément est trop élevé pour une modification : propose plutôt un nouveau brief.",
  delta_invalid: "Indique les jours de livraison en plus (0 à 30).",
  note_too_long: "Ton mot est trop long (500 caractères au plus).",
};

/** Un refus a toujours sa raison : le restaurateur la lit. */
export function sanitizeReason(raw: unknown): string {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return typeof o.reason === "string" ? o.reason.trim().slice(0, REASON_MAX + 1) : "";
}

export function validateReason(reason: string): "ok" | "too_short" | "too_long" {
  return reason.length < REASON_MIN ? "too_short" : reason.length > REASON_MAX ? "too_long" : "ok";
}

export const PROVIDER_REFUSAL_REASONS = ["Je ne suis pas disponible pour ce changement", "Ça change trop le projet : c'est un nouveau brief", "Ce n'est pas faisable dans le délai", "Autre raison"] as const;

// ── Les réponses, selon l'état ───────────────────────────────

export type AnswerVerdict = "ok" | "not_expected";

export const judgeProviderAnswer = (status: ChangeStatus): AnswerVerdict => (status === "proposed" ? "ok" : "not_expected");

/** Le restaurateur répond au supplément (ou retire sa demande) tant que la fenêtre de J-7 est ouverte. */
export function judgeRestaurantAnswer(status: ChangeStatus, shootDate: string | null, today: string): AnswerVerdict | "too_late" {
  if (status !== "quoted") return "not_expected";
  if (shootDate && today > addDays(shootDate, -SHOOT_MIN_DAYS)) return "too_late";
  return "ok";
}

export const canWithdraw = (status: ChangeStatus): boolean => OPEN_STATUSES.includes(status);

// ── L'expiration (le cron) ───────────────────────────────────

export type ExpiryInput = { status: ChangeStatus; createdAt: string; shootDate: string | null };

/**
 * Une demande ouverte expire quand : le prestataire n'a pas répondu en 3 jours, ou la fenêtre de J-7 est passée
 * (le brief d'origine tient dans les deux cas). Un supplément déjà proposé n'expire pas au bout de 3 jours : il
 * attend le restaurateur jusqu'à J-7.
 */
export function shouldExpire(c: ExpiryInput, today: string, now: Date): boolean {
  if (!OPEN_STATUSES.includes(c.status)) return false;
  if (c.shootDate && today > addDays(c.shootDate, -SHOOT_MIN_DAYS)) return true;
  if (c.status === "proposed" && now.getTime() - new Date(c.createdAt).getTime() > PROVIDER_ANSWER_DAYS * 24 * 3600 * 1000) return true;
  return false;
}
