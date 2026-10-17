import type { Plan } from "../entitlements";
import { AD_FEE_PCT } from "../service-offers";

// ADR 0086 §3-4 — l'argent de la Pub. Module PUR et testé, tout en centimes
// entiers : jamais de flottant pour un montant facturé.

/** Plancher du plafond de campagne chez Meta (constaté le 2026-10-17). */
export const MIN_BUDGET_CENTS = 100_00;

/** Moins de jours de budget que ça au rythme actuel → alerte au restaurateur. */
export const LOW_CREDIT_DAYS = 2;

export type Quote = {
  budgetCents: number;
  feePct: number;
  feeCents: number;
  /** Budget + frais, hors TVA. */
  netCents: number;
  vatRate: number;
  vatCents: number;
  /** Ce que le restaurateur paie. */
  totalCents: number;
};

/**
 * Montant demandé pour une campagne : budget + frais du forfait (+ TVA si
 * l'émetteur n'est plus en franchise — `vatRate` en %, 0 aujourd'hui).
 */
export function quote(p: { budgetCents: number; plan: Plan; vatRate: number }): Quote {
  if (!Number.isInteger(p.budgetCents) || p.budgetCents < MIN_BUDGET_CENTS) {
    throw new RangeError(`budget minimum ${MIN_BUDGET_CENTS / 100} € (reçu ${p.budgetCents / 100} €)`);
  }
  if (!(p.vatRate >= 0 && p.vatRate <= 100)) throw new RangeError(`taux de TVA invalide : ${p.vatRate}`);
  const feePct = AD_FEE_PCT[p.plan];
  const feeCents = Math.round((p.budgetCents * feePct) / 100);
  const netCents = p.budgetCents + feeCents;
  const vatCents = Math.round((netCents * p.vatRate) / 100);
  return { budgetCents: p.budgetCents, feePct, feeCents, netCents, vatRate: p.vatRate, vatCents, totalCents: netCents + vatCents };
}

/** Un montant pour l'humain : 27830 → « 278,30 € ». */
export function formatEur(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${euros},${String(abs % 100).padStart(2, "0")} €`;
}

export type CreditEntry = { kind: "versement" | "correction"; amountCents: number };

/** Crédit payé pour une campagne (frais exclus) : la somme du registre, jamais une colonne. */
export function paidCents(entries: readonly CreditEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amountCents, 0);
}

/**
 * Plafond à poser chez Meta : le total payé (ADR 0086 §4). Jamais sous le
 * plancher de Meta ; un total sous le plancher est une anomalie du registre.
 */
export function spendCapCents(paid: number): number {
  if (paid < MIN_BUDGET_CENTS) throw new RangeError(`crédit ${paid / 100} € sous le plancher Meta`);
  return paid;
}

/** Jours de budget restants au rythme moyen des derniers jours ; null si rien ne se dépense. */
export function daysLeft(remainingCents: number, recentDailySpendCents: readonly number[]): number | null {
  const spending = recentDailySpendCents.filter((c) => c > 0);
  if (spending.length === 0) return null;
  const avg = spending.reduce((s, c) => s + c, 0) / spending.length;
  return Math.max(0, remainingCents) / avg;
}

export function isLowCredit(remainingCents: number, recentDailySpendCents: readonly number[]): boolean {
  const d = daysLeft(remainingCents, recentDailySpendCents);
  return d !== null && d < LOW_CREDIT_DAYS;
}
