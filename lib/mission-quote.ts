// ============================================================
// Réserver un prestataire (ADR 0084 §2, §3 règle 2) — le devis.
//
// Le prestataire chiffre durée et prix après avoir lu le brief. Son devis est
// FERME pour ce brief : sous-estimer est son risque, pas celui du
// restaurateur. Ce fichier dit ce qu'un devis valide contient et ce que
// chacun en lit (le prestataire : « vous recevez » ; le restaurateur : le
// prix qu'il paie selon son plan, l'acompte, le solde). Fonctions PURES.
// ============================================================

import type { Plan } from "./entitlements";
import { priceBreakdown, providerQuoteView, splitPayment, DEFAULT_TERMS, type MarketplaceTerms, type Metier } from "./mission-money";

/** Ce qu'un devis peut inclure, par métier — ce qui n'est pas coché est EXCLU (dit au restaurateur, jamais sous-entendu). */
export const QUOTE_INCLUDES: Record<Metier, readonly string[]> = {
  video: ["Tournage sur place", "Montage", "Sous-titres", "Musique libre de droits", "Étalonnage des couleurs", "Formats 9:16 et 1:1"],
  photo: ["Prise de vue sur place", "Retouche des images", "Export web", "Export impression"],
  design: ["Création", "Déclinaisons de format", "Fichiers sources", "Fichier prêt pour l'impression"],
  impression: ["Impression", "Livraison", "Épreuve avant tirage", "Finition"],
};

export const MAX_QUOTE_CENTS = 10_000_000; // 100 000 €
export const MAX_HOURS = 200;
export const MAX_DELIVERY_DAYS = 90;
export const MAX_HYPOTHESES = 1_000;

export type QuoteInput = {
  priceCents: number;
  hours: number;
  deliveryDays: number;
  included: string[];
  hypotheses: string;
};

export type QuoteIssueCode = "price_invalid" | "price_too_high" | "hours_invalid" | "delivery_invalid" | "included_empty" | "included_unknown" | "hypotheses_too_long";
export type QuoteIssue = { field: "price" | "hours" | "delivery" | "included" | "hypotheses"; code: QuoteIssueCode };

const FIELD: Record<QuoteIssueCode, QuoteIssue["field"]> = {
  price_invalid: "price",
  price_too_high: "price",
  hours_invalid: "hours",
  delivery_invalid: "delivery",
  included_empty: "included",
  included_unknown: "included",
  hypotheses_too_long: "hypotheses",
};

/** Ramène ce qui arrive du réseau à la forme d'un devis ; ce qui n'a pas de sens devient NaN / vide et sera refusé par `validateQuote`. */
export function sanitizeQuote(raw: unknown): QuoteInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);
  return {
    priceCents: num(o.priceCents),
    hours: num(o.hours),
    deliveryDays: num(o.deliveryDays),
    included: Array.isArray(o.included) ? o.included.filter((x): x is string => typeof x === "string").map((x) => x.trim()).slice(0, 20) : [],
    hypotheses: typeof o.hypotheses === "string" ? o.hypotheses.trim().slice(0, MAX_HYPOTHESES + 1) : "",
  };
}

export function validateQuote(q: QuoteInput, metier: Metier): { ok: boolean; issues: QuoteIssue[] } {
  const codes: QuoteIssueCode[] = [];
  if (!Number.isInteger(q.priceCents) || q.priceCents <= 0) codes.push("price_invalid");
  else if (q.priceCents > MAX_QUOTE_CENTS) codes.push("price_too_high");
  // Des heures au quart d'heure près, jamais « 0 » : un devis sans durée est la première cause de dispute.
  if (!Number.isFinite(q.hours) || q.hours < 0.5 || q.hours > MAX_HOURS || Math.round(q.hours * 4) !== q.hours * 4) codes.push("hours_invalid");
  if (!Number.isInteger(q.deliveryDays) || q.deliveryDays < 1 || q.deliveryDays > MAX_DELIVERY_DAYS) codes.push("delivery_invalid");
  if (q.included.length === 0) codes.push("included_empty");
  else if (q.included.some((x) => !QUOTE_INCLUDES[metier].includes(x))) codes.push("included_unknown");
  if (q.hypotheses.length > MAX_HYPOTHESES) codes.push("hypotheses_too_long");
  return { ok: codes.length === 0, issues: codes.map((code) => ({ field: FIELD[code], code })) };
}

/** Ce qui n'est PAS dans le devis : calculé, jamais saisi — l'exclusion est dite noir sur blanc au restaurateur. */
export function excludedFor(metier: Metier, included: readonly string[]): string[] {
  return QUOTE_INCLUDES[metier].filter((x) => !included.includes(x));
}

/** Le prix demandé est-il dans le budget indiqué par le restaurateur ? (information, jamais un refus) */
export function quoteVsBudget(priceCents: number, budgetCents: number | null | undefined): { within: boolean; overPct: number } | null {
  if (typeof budgetCents !== "number" || budgetCents <= 0 || !(priceCents > 0)) return null;
  const overPct = Math.round(((priceCents - budgetCents) / budgetCents) * 100);
  return { within: priceCents <= budgetCents, overPct: Math.max(0, overPct) };
}

/** Ce que le prestataire lit : le prix de son devis et ce qu'il reçoit (87,5 %). */
export function providerView(priceCents: number, terms: MarketplaceTerms = DEFAULT_TERMS) {
  return providerQuoteView(priceCents, terms);
}

/** Ce que le restaurateur lit : le prix selon SON plan, l'acompte, le solde. Figé au paiement, pas ici. */
export function restaurantView(priceCents: number, plan: Plan, terms: MarketplaceTerms = DEFAULT_TERMS) {
  const b = priceBreakdown(priceCents, plan, terms);
  const s = splitPayment(b.paidCents, terms.depositBps);
  return { paidCents: b.paidCents, depositCents: s.depositCents, balanceCents: s.balanceCents, depositBps: s.depositBps };
}

/** Ce que le prestataire peut dire en refusant un brief (jamais « sans raison »). */
export const REFUSAL_REASONS = ["Je ne suis pas disponible", "Le brief est trop flou", "Le budget est trop bas pour ce brief", "Ce n'est pas mon métier", "Autre raison"] as const;
