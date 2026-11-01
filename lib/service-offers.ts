import type { Plan } from "./entitlements";

// ADR 0081 §6 — ce que la console promet des services marketing, côté texte.
// Module PUR (importable par un composant client) : les frais de la pub
// dépendent du forfait, décision du porteur du 2026-10-07.

/** Frais de service Boosteats sur le budget d'une pub, selon le forfait. */
export const AD_FEE_PCT: Record<Plan, number> = { gratuit: 20, croissance: 15, pro: 5 };

export type AdFee = { plan: Plan; feePct: number; negotiated: boolean };

/**
 * ADR 0086 amendé le 2026-11-01 — un taux négocié avec l'établissement
 * (`restaurant_subscriptions.ad_fee_pct`) remplace le tarif du forfait ; sinon
 * le tarif du forfait. Un taux illisible (hors 0–50 %) est ignoré.
 */
export function resolveAdFee(plan: Plan, negotiatedPct: number | null | undefined): AdFee {
  const n = negotiatedPct == null ? NaN : Number(negotiatedPct);
  if (Number.isFinite(n) && n >= 0 && n <= 50) return { plan, feePct: n, negotiated: true };
  return { plan, feePct: AD_FEE_PCT[plan], negotiated: false };
}
