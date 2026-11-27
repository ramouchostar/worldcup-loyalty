// ADR 0112 — quelles occasions deviennent un article, et lesquelles sont écartées. PUR, testé.
// Un article automatique par jour au plus, trois par semaine (lundi à dimanche). Priorité : promo, puis événement
// proche, puis match, puis météo. Ce qui est écarté est gardé avec sa raison.

import { REVIVABLE, type AutoReason } from "./reasons";
import { addDays, weekStart } from "./time";
import {
  ACTIVE_STATUSES, HORIZON_DAYS, MAX_PER_WEEK, priorityOf, type AutoKind, type Candidate, type Occasion,
} from "./types";

/** Par type et par jour, on ne retient (ou n'écarte avec trace) que les trois premières occasions. */
export const MAX_CONSIDERED = 3;

export type ExistingOccasion = Pick<Occasion, "id" | "kind" | "source_key" | "publish_day" | "status" | "reason" | "modified_at">;

export type PlanStep = {
  candidate: Candidate;
  /** Le jour retenu (ou, pour une occasion écartée, son premier jour possible). */
  slot: Candidate["days"][number];
  /** Une occasion écartée à l'arrêt ou au décochage qui revient. */
  reviveId: string | null;
};

export type Plan = {
  create: PlanStep[];
  discard: (PlanStep & { reason: AutoReason })[];
  /** Des occasions prévues (pas encore annoncées) qui cèdent leur jour à plus prioritaire. */
  replace: string[];
};

type Slot = { id: string | null; kind: AutoKind; day: string; replaceable: boolean };

export function planOccasions(p: { today: string; kinds: readonly AutoKind[]; candidates: Candidate[]; existing: ExistingOccasion[] }): Plan {
  const first = addDays(p.today, 1);
  const last = addDays(p.today, HORIZON_DAYS);
  const known = new Map(p.existing.map((o) => [o.source_key, o]));
  const taken: Slot[] = p.existing
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .map((o) => ({ id: o.id, kind: o.kind, day: o.publish_day, replaceable: o.status === "prevu" && o.modified_at === null }));

  const plan: Plan = { create: [], discard: [], replace: [] };
  const seen = new Set<string>();
  const considered = new Map<string, number>();

  const list = p.candidates
    .filter((c) => p.kinds.includes(c.kind))
    .map((c) => ({ ...c, days: c.days.filter((d) => d.day >= first && d.day <= last).sort((a, b) => a.day.localeCompare(b.day)) }))
    .filter((c) => c.days.length > 0)
    .sort(
      (a, b) =>
        priorityOf(a.kind) - priorityOf(b.kind) ||
        a.days[0].day.localeCompare(b.days[0].day) ||
        a.rank - b.rank ||
        a.sourceKey.localeCompare(b.sourceKey),
    );

  for (const c of list) {
    if (seen.has(c.sourceKey)) continue;
    seen.add(c.sourceKey);
    const before = known.get(c.sourceKey);
    // Déjà traitée : on ne repropose pas ce qui a été refusé, publié ou écarté pour de bon.
    if (before && !(before.status === "ecarte" && before.reason !== null && REVIVABLE.has(before.reason))) continue;
    const reviveId = before?.id ?? null;

    const bucket = `${c.kind}|${c.days[0].day}`;
    const n = considered.get(bucket) ?? 0;
    if (n >= MAX_CONSIDERED) continue;
    considered.set(bucket, n + 1);

    let reason: AutoReason = "un_par_jour";
    let chosen: Candidate["days"][number] | null = null;
    for (const slot of c.days) {
      const occupant = taken.find((t) => t.day === slot.day);
      if (occupant) {
        if (occupant.replaceable && occupant.id !== null && priorityOf(c.kind) < priorityOf(occupant.kind)) {
          plan.replace.push(occupant.id);
          taken.splice(taken.indexOf(occupant), 1);
        } else {
          reason = "un_par_jour";
          continue;
        }
      } else if (taken.filter((t) => weekStart(t.day) === weekStart(slot.day)).length >= MAX_PER_WEEK) {
        reason = "limite_semaine";
        continue;
      }
      chosen = slot;
      break;
    }

    if (chosen) {
      plan.create.push({ candidate: c, slot: chosen, reviveId });
      taken.push({ id: null, kind: c.kind, day: chosen.day, replaceable: false });
    } else {
      plan.discard.push({ candidate: c, slot: c.days[0], reason, reviveId });
    }
  }
  return plan;
}
