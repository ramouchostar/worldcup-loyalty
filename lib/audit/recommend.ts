// ADR 0068 §3 — choisir, parmi les scénarios qui correspondent à l'audit,
// ceux qui méritent d'être dits au gérant, et dans quel ordre.
//
// Priorité = impact² ÷ effort × poids de famille. Impact au carré : un gros
// effet l'emporte sur un petit effort facile (sinon « écrire la description »
// passerait devant « régler l'attente »). Les thèmes des avis pèsent 1,6 : ce
// sont des causes que les clients ont déjà nommées, pas des hypothèses.
//
// Une seule solution par famille dans les priorités — sauf la fiche Google, où
// deux manques rapides peuvent se suivre — pour que les cinq priorités
// couvrent cinq sujets, pas cinq variantes du même. Un scénario marqué
// `after` attend qu'une solution de la famille visée soit déjà choisie.

import { SCENARIOS, type Family, type Horizon, type Scenario } from "./scenarios";
import type { AuditSignals } from "./signals";

const PER_FAMILY_CAP: Partial<Record<Family, number>> = { fiche: 2 };
const FAMILY_WEIGHT: Partial<Record<Family, number>> = { avis_theme: 1.6 };

export function priority(s: Pick<Scenario, "impact" | "effort" | "family">): number {
  return ((s.impact * s.impact) / s.effort) * (FAMILY_WEIGHT[s.family] ?? 1);
}

export function matchingScenarios(signals: AuditSignals, library: readonly Scenario[] = SCENARIOS): Scenario[] {
  return library
    .filter((s) => s.when(signals))
    .sort((a, b) => priority(b) - priority(a) || a.id.localeCompare(b.id));
}

export interface Recommendations {
  /** Les priorités du rapport, dans l'ordre où les dire. */
  top: Scenario[];
  /** Tout ce qui correspond, rangé par horizon — le plan à 90 jours. */
  plan: Record<Horizon, Scenario[]>;
  matched: number;
}

export function recommend(signals: AuditSignals, limit = 5): Recommendations {
  const all = matchingScenarios(signals);
  const matchedFamilies = new Set(all.map((s) => s.family));
  const used = new Map<Family, number>();
  const top: Scenario[] = [];
  const ready = (s: Scenario) => !s.after || !matchedFamilies.has(s.after) || used.has(s.after);
  const fits = (s: Scenario) => (used.get(s.family) ?? 0) < (PER_FAMILY_CAP[s.family] ?? 1);

  // On reprend la liste depuis le début après chaque choix : un scénario mis
  // en attente par `after` retrouve sa place dès que son préalable est dit.
  while (top.length < limit) {
    const next = all.find((s) => !top.includes(s) && fits(s) && ready(s));
    if (!next) break;
    used.set(next.family, (used.get(next.family) ?? 0) + 1);
    top.push(next);
  }

  const plan: Record<Horizon, Scenario[]> = { "7 jours": [], "30 jours": [], "90 jours": [] };
  for (const s of all) plan[s.horizon].push(s);
  return { top, plan, matched: all.length };
}
