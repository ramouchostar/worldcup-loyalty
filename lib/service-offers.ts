import type { Plan } from "./entitlements";

// ADR 0081 §6 — ce que la console promet des services marketing, côté texte.
// Module PUR (importable par un composant client) : les frais de la pub
// dépendent du forfait, décision du porteur du 2026-10-07.

/** Frais de service Boosteats sur le budget d'une pub, selon le forfait. */
export const AD_FEE_PCT: Record<Plan, number> = { gratuit: 20, croissance: 15, pro: 5 };
