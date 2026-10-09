// ============================================================
// Réserver un prestataire (ADR 0084) — l'argent d'une mission.
//
// Le prestataire reçoit TOUJOURS 87,5 % du prix de son devis (P). La commission
// de Boosteats est COMPRISE dans P : le restaurateur ne voit jamais de ligne
// « commission ». Plan Pro : il paie 92,5 % de P, Boosteats garde 5 % de P.
//
//   Gratuit / Croissance : paie P,        prestataire 87,5 % P, Boosteats 12,5 % P
//   Pro                  : paie 92,5 % P, prestataire 87,5 % P, Boosteats  5   % P
//
// Fonctions PURES, en centimes entiers (jamais de flottants sur de l'argent) :
// le plan est une entrée, le prix payé est FIGÉ au paiement par l'appelant.
//
// Surface restaurateur, prestataire et plateforme uniquement : les euros sont
// permis ici (B2B) et ne remontent JAMAIS vers un membre (ADR 0007).
// ============================================================

import type { Plan } from "./entitlements";

/** 100 % = 10 000 points de base. */
export const BPS = 10_000;

/** Acompte plancher : jamais moins de 20 % (ADR 0084 §2), quelle que soit la configuration. */
export const MIN_DEPOSIT_BPS = 2_000;

export type MarketplaceTerms = {
  /** Commission comprise dans le prix du devis (Gratuit, Croissance). 1250 = 12,5 %. */
  commissionBps: number;
  /** Commission du plan Pro. 500 = 5 %. */
  proCommissionBps: number;
  /** Acompte demandé au paiement du devis. Relevé à MIN_DEPOSIT_BPS s'il est plus bas. */
  depositBps: number;
};

export const DEFAULT_TERMS: MarketplaceTerms = {
  commissionBps: 1_250,
  proCommissionBps: 500,
  depositBps: 2_000,
};

export type PriceBreakdown = {
  /** Prix du devis (P), en centimes. */
  quoteCents: number;
  /** Ce que paie le restaurateur (hors TVA). */
  paidCents: number;
  /** Ce que reçoit le prestataire : toujours (1 − commission) × P. */
  providerCents: number;
  /** Ce que garde Boosteats (avant frais Stripe). */
  platformCents: number;
  /** Commission réellement appliquée à ce plan, en points de base de P. */
  commissionBps: number;
};

function assertCents(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} doit être un entier de centimes ≥ 0 (reçu ${n})`);
}

function assertTerms(t: MarketplaceTerms): void {
  for (const [k, v] of Object.entries(t)) {
    if (!Number.isInteger(v) || v < 0 || v > BPS) throw new Error(`${k} doit être un entier entre 0 et ${BPS} (reçu ${v})`);
  }
  if (t.proCommissionBps > t.commissionBps) {
    throw new Error("la commission Pro ne peut pas dépasser la commission standard (remise négative)");
  }
}

/** Ventilation d'un devis selon le plan du restaurateur à l'instant du paiement. */
export function priceBreakdown(quoteCents: number, plan: Plan, terms: MarketplaceTerms = DEFAULT_TERMS): PriceBreakdown {
  assertCents(quoteCents, "quoteCents");
  assertTerms(terms);
  const planCommissionBps = plan === "pro" ? terms.proCommissionBps : terms.commissionBps;
  // Remise du plan = écart entre la commission standard et celle du plan.
  const discountBps = terms.commissionBps - planCommissionBps;
  const providerCents = Math.round((quoteCents * (BPS - terms.commissionBps)) / BPS);
  const paidCents = Math.round((quoteCents * (BPS - discountBps)) / BPS);
  return { quoteCents, paidCents, providerCents, platformCents: paidCents - providerCents, commissionBps: planCommissionBps };
}

/** Ce que le prestataire lit sur son devis : « prix du devis » et « vous recevez ». */
export function providerQuoteView(quoteCents: number, terms: MarketplaceTerms = DEFAULT_TERMS): { quoteCents: number; youReceiveCents: number } {
  assertCents(quoteCents, "quoteCents");
  assertTerms(terms);
  return { quoteCents, youReceiveCents: Math.round((quoteCents * (BPS - terms.commissionBps)) / BPS) };
}

export type PaymentSplit = { depositCents: number; balanceCents: number; depositBps: number };

/** Acompte (arrondi à l'EXCÈS, jamais en dessous de 20 %) et solde. */
export function splitPayment(paidCents: number, depositBps: number = DEFAULT_TERMS.depositBps): PaymentSplit {
  assertCents(paidCents, "paidCents");
  const bps = Math.min(BPS, Math.max(depositBps, MIN_DEPOSIT_BPS));
  const depositCents = Math.min(paidCents, Math.ceil((paidCents * bps) / BPS));
  return { depositCents, balanceCents: paidCents - depositCents, depositBps: bps };
}

export type Metier = "video" | "photo" | "design" | "impression";

/** Quand le solde est prélevé (ADR 0084 §2). */
export type BalanceDue =
  | { when: "before_shoot"; daysBefore: number }
  | { when: "after_bat" }
  | { when: "at_first_delivery" };

export function balanceDue(metier: Metier): BalanceDue {
  switch (metier) {
    case "video":
    case "photo":
      return { when: "before_shoot", daysBefore: 2 };
    case "impression":
      return { when: "after_bat" };
    case "design":
      return { when: "at_first_delivery" };
  }
}

/** Euros « 1 234,50 € » pour l'interface restaurateur / prestataire / plateforme (jamais membre). */
export function formatEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-BE", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} €`;
}
