import { getConsentingUserIds } from "./consent";

// ADR 0022 — Insights d'AUDIENCE vendus au restaurateur (segments de membres,
// ex. « les équipes d'écoles commandent plus le vendredi »). DEUX garde-fous
// obligatoires, distincts du moteur de suggestions PRODUITS (lib/insights.ts) :
//   1. N'inclure que les membres ayant consenti (`insights_commerciaux`).
//   2. Ne jamais exposer un segment de moins de INSIGHTS_MIN_SEGMENT membres
//      (anti ré-identification / k-anonymat).
// La surface d'insights d'audience n'est pas encore construite : ce module en
// pose les garde-fous réutilisables, à brancher dès qu'un agrégat est exposé.

export const INSIGHTS_MIN_SEGMENT = 20;

export function meetsAggregationThreshold(memberCount: number): boolean {
  return memberCount >= INSIGHTS_MIN_SEGMENT;
}

// Masque tout segment sous le seuil (à appeler avant d'exposer des agrégats).
export function enforceThreshold<T extends { count: number }>(segments: T[]): T[] {
  return segments.filter((s) => meetsAggregationThreshold(s.count));
}

// Les membres à inclure dans les agrégats vendables (consentement insights).
export async function getInsightsConsentingUsers(userIds: string[]): Promise<Set<string>> {
  return getConsentingUserIds(userIds, "insights_commerciaux");
}
