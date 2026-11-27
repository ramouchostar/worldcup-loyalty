// ADR 0112 — le contrat d'une source d'occasions. Une source dit ce qu'elle voit dans les jours qui viennent, et
// revérifie une occasion juste avant de la publier. Elle ne rédige rien et n'écrit rien dans les articles.

import type { AutoReason } from "../reasons";
import type { AutoKind, Candidate, Facts } from "../types";

export type SourceContext = {
  restaurantId: string;
  coords: { lat: number; lng: number } | null;
  now: Date;
  /**
   * La source peut-elle interroger un service qui limite le moment des appels (la météo) ? Non pour la tâche qui passe
   * à l'heure pile : elle ne lit que ce qui est en réserve. Oui quand une personne appuie, et pour la tâche décalée.
   */
  network: boolean;
  /** Une personne appuie sur « Publier maintenant » : ce qui doit être vrai aujourd'hui l'est vérifié aussi. */
  publishing?: "maintenant";
};

export type SourceRead = { ok: true; candidates: Candidate[] } | { ok: false; error: string };
export type Recheck = { ok: true } | { ok: false; reason: AutoReason };

export type OccasionSource = {
  kind: AutoKind;
  /** Pourquoi cette source ne peut rien donner (pas branchée, réglage absent), ou `null`. */
  unavailable(): Promise<string | null>;
  /** Les occasions des jours `from` à `to` (bornes comprises, jours de Bruxelles). */
  read(ctx: SourceContext, window: { from: string; to: string }): Promise<SourceRead>;
  recheck(ctx: SourceContext, facts: Facts): Promise<Recheck>;
  /** Remplir la réserve avant le passage suivant, pour les sources qui en ont une. */
  prefetch?(ctx: SourceContext): Promise<{ ok: true } | { ok: false; error: string }>;
};
