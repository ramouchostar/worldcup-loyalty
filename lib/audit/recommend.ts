// ADR 0069 §3 — choisir, parmi les scénarios qui correspondent à l'audit,
// ceux qui méritent d'être dits au gérant, et dans quel ordre.
//
// Priorité = impact² ÷ effort × poids de famille × confirmation. Impact au
// carré : un gros effet l'emporte sur un petit effort facile (sinon « écrire
// la description » passerait devant « régler l'attente »). Pèsent plus : les
// thèmes des avis (1,6, des causes que les clients ont nommées) et ce que le
// gérant a déclaré lui-même (produit phare 1,5, canaux 1,6). `boost` monte un
// scénario qu'un autre signal confirme.
//
// Une seule solution par famille dans les priorités — sauf la fiche Google, où
// deux manques rapides peuvent se suivre — pour que les cinq priorités
// couvrent cinq sujets. Un scénario marqué `after` attend qu'une solution de
// la famille visée soit déjà choisie. L'objectif de chiffre d'affaires ne
// concourt pas : c'est le cadre du plan, affiché à part.

import { SCENARIOS, type Family, type Horizon, type Scenario } from "./scenarios";
import type { AuditSignals } from "./signals";

const PER_FAMILY_CAP: Partial<Record<Family, number>> = { fiche: 2, seo: 2 };
const FAMILY_WEIGHT: Partial<Record<Family, number>> = { avis_theme: 1.6, produit_phare: 1.5, canaux: 1.6 };
const FRAME_FAMILY: Family = "objectif";

export function priority(s: Scenario, signals: AuditSignals): number {
  return ((s.impact * s.impact) / s.effort) * (FAMILY_WEIGHT[s.family] ?? 1) * (s.boost?.(signals) ?? 1);
}

export function matchingScenarios(signals: AuditSignals, library: readonly Scenario[] = SCENARIOS): Scenario[] {
  return library
    .filter((s) => s.when(signals))
    .sort((a, b) => priority(b, signals) - priority(a, signals) || a.id.localeCompare(b.id));
}

export interface Recommendations {
  /** Les priorités du rapport, dans l'ordre où les dire. */
  top: Scenario[];
  /** Le cadre : comment atteindre l'objectif de CA du gérant, s'il l'a donné. */
  objective: Scenario | null;
  /** Tout ce qui correspond, rangé par horizon — le plan à 90 jours. */
  plan: Record<Horizon, Scenario[]>;
  matched: number;
}

export function recommend(signals: AuditSignals, limit = 5): Recommendations {
  const all = matchingScenarios(signals);
  const candidates = all.filter((s) => s.family !== FRAME_FAMILY);
  const matchedFamilies = new Set(candidates.map((s) => s.family));
  const used = new Map<Family, number>();
  const top: Scenario[] = [];
  const ready = (s: Scenario) => !s.after || !matchedFamilies.has(s.after) || used.has(s.after);
  const fits = (s: Scenario) => (used.get(s.family) ?? 0) < (PER_FAMILY_CAP[s.family] ?? 1);

  // On reprend la liste depuis le début après chaque choix : un scénario mis
  // en attente par `after` retrouve sa place dès que son préalable est dit.
  while (top.length < limit) {
    const next = candidates.find((s) => !top.includes(s) && fits(s) && ready(s));
    if (!next) break;
    used.set(next.family, (used.get(next.family) ?? 0) + 1);
    top.push(next);
  }

  const plan: Record<Horizon, Scenario[]> = { "7 jours": [], "30 jours": [], "90 jours": [] };
  for (const s of candidates) plan[s.horizon].push(s);
  return { top, objective: all.find((s) => s.family === FRAME_FAMILY) ?? null, plan, matched: all.length };
}
