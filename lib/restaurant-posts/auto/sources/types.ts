// ADR 0112 — le contrat d'une source d'occasions. Une source dit ce qu'elle voit dans les jours qui viennent, et
// revérifie une occasion juste avant de la publier. Elle ne rédige rien et n'écrit rien en base.

import type { AutoReason } from "../reasons";
import type { AutoKind, Candidate, Facts } from "../types";

export type SourceContext = { restaurantId: string; coords: { lat: number; lng: number } | null; now: Date };

export type SourceRead = { ok: true; candidates: Candidate[] } | { ok: false; error: string };
export type Recheck = { ok: true } | { ok: false; reason: AutoReason };

export type OccasionSource = {
  kind: AutoKind;
  /** Pourquoi cette source ne peut rien donner (pas branchée, clé absente, interdite), ou `null`. */
  unavailable(): string | null;
  /** Les occasions des jours `from` à `to` (bornes comprises, jours de Bruxelles). */
  read(ctx: SourceContext, window: { from: string; to: string }): Promise<SourceRead>;
  recheck(ctx: SourceContext, facts: Facts): Promise<Recheck>;
};
