// ADR 0069 §6 — la révision de l'audit après les réponses du gérant.
//
// On recalcule les recommandations avec les signaux enrichis des réponses
// (`withAnswers`), puis on dit ce qui a changé entre la première lecture et la
// version finale : ce qui entre dans les priorités, ce qui en sort, ce qui
// monte ou descend. Le rapport final affiche ce « ce qui a changé » : le gérant
// voit que ses réponses ont servi, et nous voyons si elles changent souvent
// le plan (si jamais, les questions ne servent à rien).

import { recommend, type Recommendations } from "./recommend";
import type { Scenario } from "./scenarios";
import { withAnswers, type AuditSignals, type OwnerAnswers } from "./signals";

export type Change =
  | { kind: "ajoutee"; scenario: Scenario; rank: number }
  | { kind: "retiree"; scenario: Scenario }
  | { kind: "deplacee"; scenario: Scenario; from: number; to: number };

export interface Revision {
  before: Recommendations;
  after: Recommendations;
  changes: Change[];
  /** Nouveaux scénarios qui correspondent grâce aux réponses (pas seulement dans les priorités). */
  newlyMatched: number;
}

export function reviseWithAnswers(measured: AuditSignals, answers: OwnerAnswers): Revision {
  const before = recommend(measured);
  const after = recommend(withAnswers(measured, answers));
  const changes: Change[] = [];

  after.top.forEach((s, i) => {
    const was = before.top.findIndex((b) => b.id === s.id);
    if (was === -1) changes.push({ kind: "ajoutee", scenario: s, rank: i + 1 });
    else if (was !== i) changes.push({ kind: "deplacee", scenario: s, from: was + 1, to: i + 1 });
  });
  for (const s of before.top) {
    if (!after.top.some((a) => a.id === s.id)) changes.push({ kind: "retiree", scenario: s });
  }

  const beforeIds = new Set([...Object.values(before.plan)].flat().map((s) => s.id));
  const newlyMatched = [...Object.values(after.plan)].flat().filter((s) => !beforeIds.has(s.id)).length;
  return { before, after, changes, newlyMatched };
}
