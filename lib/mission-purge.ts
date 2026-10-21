// ============================================================
// Réserver un prestataire (ADR 0084 §5 quaterdecies) — la purge « durée de la mission + 12 mois ». RÈGLES PURES.
//
// Décision (2026-10-21) : la purge existe en rapport à blanc seulement. Elle COMPTE ce qui serait effacé, elle n'efface RIEN, tant que
// le juriste n'a pas validé durée et liste. Ce qui n'est JAMAIS touché : les montants, les devis, la trace (`mission_events`), la
// signature du bon à tirer et les règles acceptées — pièces comptables et preuves en cas de litige.
// ============================================================

export const PURGE_MONTHS = 12;

/** Les états où la mission est finie. `litige` n'en fait pas partie : un dossier ouvert garde toutes ses pièces. */
export const PURGEABLE_STATUSES = ["verse", "annule"] as const;

export type PurgeMission = {
  status: string;
  validated_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
};

/** Le jour où la mission s'est terminée : l'annulation, la validation, à défaut la dernière mise à jour. */
export function endedAt(m: PurgeMission): Date {
  return new Date(m.status === "annule" ? (m.cancelled_at ?? m.updated_at) : (m.validated_at ?? m.updated_at));
}

/** La date avant laquelle une mission finie est « purgeable » (maintenant moins 12 mois). */
export function purgeCutoff(now: Date): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - PURGE_MONTHS);
  return d;
}

export function isPurgeable(m: PurgeMission, now: Date): boolean {
  if (!(PURGEABLE_STATUSES as readonly string[]).includes(m.status)) return false;
  const end = endedAt(m);
  return !Number.isNaN(end.getTime()) && end.getTime() <= purgeCutoff(now).getTime();
}

/** Ce qu'une purge effacerait, par catégorie. Le contact du brief (nom, téléphone) est vidé, le reste du brief reste. */
export type PurgeReport = {
  dryRun: true;
  cutoff: string;
  missions: number;
  messages: number;
  attachments: number;
  attachmentBytes: number;
  deliveries: number;
  proofs: number;
  briefContacts: number;
  /** Les catégories dont la table n'existe pas (migration absente) : comptées à zéro, dites ici. */
  unavailable: string[];
};
