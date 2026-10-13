// ============================================================
// Réserver un prestataire (ADR 0084 §4) — annuler, ce que ça coûte, ce que ça déclenche.
//
// La date de tournage LIE le restaurateur ; l'absence ou l'annulation tardive du prestataire se paie
// aussi (remboursement total + sanction graduée : avertissement, visibilité réduite, puis exclusion).
// Ce fichier réunit les règles : qui peut annuler quoi, quelle bande, quel montant, quelle sanction.
// Fonctions PURES : l'instant est injecté. Le barème lui-même vit dans lib/mission-cancellation.ts.
// ============================================================

import { canTransition, type Actor, type MissionStatus } from "./mission-states";
import { cancelBand, cancellationOutcome, hoursBeforeShoot, type CancelBand, type CancellationOutcome, type ProviderSanction } from "./mission-cancellation";

export type Canceller = "restaurant" | "provider";

/** Les états où chacun peut annuler lui-même. Le reste passe par la plateforme (litige, tournage en cours). */
const RESTAURANT_CAN: readonly MissionStatus[] = ["brief", "envoye", "devis", "accepte", "date_bloquee", "suspendu"];
// Un brief encore à chiffrer se REFUSE (avec sa propre raison, lib/provider-missions.ts) : ici, seulement après le devis accepté.
const PROVIDER_CAN: readonly MissionStatus[] = ["accepte", "date_bloquee"];

export function canCancel(by: Canceller, status: MissionStatus): boolean {
  const allowed = by === "restaurant" ? RESTAURANT_CAN : PROVIDER_CAN;
  return allowed.includes(status) && canTransition(status, "annule", by).ok;
}

export const RESTAURANT_REASONS = ["J'ai changé d'avis", "Mon restaurant est fermé ce jour-là", "Un imprévu dans mon équipe", "Le budget a changé", "Autre raison"] as const;
export const PROVIDER_REASONS = ["Je suis malade", "J'ai un imprévu", "Mon planning a changé", "Mon matériel est indisponible", "Autre raison"] as const;

export function reasonsFor(by: Canceller): readonly string[] {
  return by === "restaurant" ? RESTAURANT_REASONS : PROVIDER_REASONS;
}

export type CancelInput = { reason: string; note: string };
export type CancelIssue = "reason_unknown" | "note_required" | "note_too_long";

export const MAX_CANCEL_NOTE = 500;

export function sanitizeCancel(raw: unknown): CancelInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    reason: typeof o.reason === "string" ? o.reason.trim() : "",
    note: typeof o.note === "string" ? o.note.trim().slice(0, MAX_CANCEL_NOTE + 1) : "",
  };
}

/** Une raison de la liste ; « Autre raison » demande un mot : une annulation sans raison ne dit rien à celui qui la subit. */
export function validateCancel(by: Canceller, i: CancelInput): { ok: true } | { ok: false; issue: CancelIssue } {
  if (!reasonsFor(by).includes(i.reason)) return { ok: false, issue: "reason_unknown" };
  if (i.note.length > MAX_CANCEL_NOTE) return { ok: false, issue: "note_too_long" };
  if (i.reason === "Autre raison" && i.note.length < 5) return { ok: false, issue: "note_required" };
  return { ok: true };
}

export const CANCEL_ISSUE_TEXT: Record<CancelIssue, string> = {
  reason_unknown: "Choisis une raison dans la liste.",
  note_required: "Explique en quelques mots ce que « autre raison » recouvre.",
  note_too_long: "Ta précision est trop longue (500 caractères au plus).",
};

// ── Le coût d'une annulation, MAINTENANT ─────────────────────

export type CancelQuote = {
  band: CancelBand;
  hoursBefore: number | null;
  outcome: CancellationOutcome;
  /** Pas encore de date réservée : rien à perdre (la date est ce qui lie). */
  beforeDate: boolean;
};

export type CancelFacts = {
  by: Canceller;
  status: MissionStatus;
  shootDate: string | null;
  shootStart: string | null;
  /** Ce que le restaurateur a payé (acompte convenu inclus) ; 0 avant l'acceptation du devis. */
  paidCents: number;
  /** Part du prestataire sur la somme payée. */
  providerCents: number;
  now: Date;
  /** Absent le jour J : toujours « tout est dû ». */
  noShow?: boolean;
};

/**
 * Ce que coûterait l'annulation à cet instant. Sans date réservée (brief, devis, devis accepté), il n'y a rien à
 * perdre : la date est ce qui lie. Avec une date, la bande dépend des heures restantes avant le début du tournage.
 */
export function quoteCancellation(f: CancelFacts): CancelQuote {
  const hasDate = !!f.shootDate && !!f.shootStart && ["date_bloquee", "suspendu", "production"].includes(f.status);
  const hoursBefore = hasDate ? hoursBeforeShoot(f.shootDate!, f.shootStart!, f.now) : null;
  const outcome = cancellationOutcome({
    by: f.by,
    hoursBefore: hoursBefore ?? Number.POSITIVE_INFINITY,
    noShow: f.noShow,
    paidCents: f.paidCents,
    providerCents: f.providerCents,
  });
  return { band: hoursBefore === null && !f.noShow ? "free" : outcome.band, hoursBefore, outcome, beforeDate: !hasDate };
}

/** La phrase que lit celui qui s'apprête à annuler. */
export function describeCost(by: Canceller, q: CancelQuote, euros: (cents: number) => string): string {
  if (q.beforeDate) return by === "restaurant" ? "Aucune date n'est encore réservée : l'annulation est gratuite." : "Aucune date n'est encore réservée : tu peux annuler sans conséquence.";
  if (by === "restaurant") {
    if (q.band === "free") return "Plus de 7 jours avant le tournage : l'annulation est gratuite, tu es remboursé en entier.";
    if (q.band === "half") return `Entre 7 jours et 48 h avant le tournage : la moitié est due (${euros(q.outcome.retainedCents)}), le reste t'est rendu.`;
    return `Moins de 48 h avant le tournage : tout est dû (${euros(q.outcome.retainedCents)}).`;
  }
  if (q.band === "free") return "Plus de 7 jours avant le tournage : tu peux annuler sans conséquence. Le restaurateur est remboursé.";
  if (q.band === "half") return "Entre 7 jours et 48 h avant le tournage : le restaurateur est remboursé et tu reçois un avertissement.";
  return "Moins de 48 h avant le tournage : le restaurateur est remboursé et ta visibilité est réduite (une récidive peut mener à l'exclusion).";
}

// ── La sanction du prestataire ───────────────────────────────

export type ProviderStanding = { warnings: number; visibility_reduced: boolean; status: string };

/** Avertissements cumulés qui réduisent la visibilité à eux seuls. */
export const WARNINGS_BEFORE_REDUCTION = 3;

/**
 * La sanction graduée de l'ADR 0084 §4 : un avertissement s'ajoute ; une pénalité réduit la visibilité, et une
 * pénalité DÉJÀ sous visibilité réduite mène à l'exclusion. Trois avertissements réduisent la visibilité.
 * Un prestataire exclu ou suspendu garde son statut (on ne rétrograde jamais par une sanction).
 */
export function applySanction(cur: ProviderStanding, sanction: ProviderSanction): ProviderStanding & { changed: boolean } {
  if (sanction === "none") return { ...cur, changed: false };
  let { warnings, visibility_reduced, status } = cur;
  warnings += 1;
  if (sanction === "penalite") {
    if (visibility_reduced && status === "active") status = "excluded";
    visibility_reduced = true;
  }
  if (warnings >= WARNINGS_BEFORE_REDUCTION) visibility_reduced = true;
  return { warnings, visibility_reduced, status, changed: true };
}

export function sanctionLabel(s: ProviderSanction): string {
  return s === "none" ? "aucune" : s === "avertissement" ? "avertissement" : "pénalité (visibilité réduite)";
}

// ── La plateforme arbitre ────────────────────────────────────

export type Fault = "restaurant" | "provider" | "none";
export const FAULT_LABELS: Record<Fault, string> = {
  restaurant: "La faute est au restaurateur",
  provider: "La faute est au prestataire",
  none: "Force majeure : personne n'est en faute",
};

/** Qui annule au sens du barème, pour une annulation décidée par la plateforme. */
export function actorForFault(fault: Fault): Canceller {
  return fault === "restaurant" ? "restaurant" : "provider";
}

/** Le jour du tournage est passé sans qu'il ait démarré : à trancher par la plateforme. */
export function isMissedShoot(status: string, shootDate: string | null, today: string): boolean {
  return status === "date_bloquee" && !!shootDate && shootDate < today;
}

export type PlatformCancelFacts = Omit<CancelFacts, "by" | "now"> & { fault: Fault; now: Date };

/**
 * L'annulation tranchée par la plateforme : la faute décide du barème ; la force majeure rembourse tout et ne
 * sanctionne personne. Un tournage jamais démarré (absence) vaut « tout est dû » à celui qui est en faute.
 */
export function quotePlatformCancellation(f: PlatformCancelFacts): CancelQuote & { sanction: ProviderSanction } {
  if (f.fault === "none") {
    const q = quoteCancellation({ ...f, by: "provider", now: f.now, noShow: false, shootDate: null });
    return { ...q, band: "free", sanction: "none", outcome: { ...q.outcome, providerSanction: "none" } };
  }
  const q = quoteCancellation({ ...f, by: actorForFault(f.fault), now: f.now });
  return { ...q, sanction: f.fault === "provider" ? q.outcome.providerSanction : "none" };
}

export { cancelBand };
export type { Actor };

// ── Le règlement, tant que Stripe n'est pas branché ──────────

export type Settlement = { direction: "collect" | "refund" | "none"; cents: number };

/**
 * Ce que la plateforme règle à la main : le restaurateur a versé l'ACOMPTE (pas le prix entier). S'il doit plus que
 * l'acompte, la plateforme le lui réclame ; s'il doit moins, elle lui rend la différence ; sinon rien.
 */
export function settlementOf(retainedCents: number, depositPaidCents: number): Settlement {
  const net = retainedCents - Math.max(0, depositPaidCents);
  if (net > 0) return { direction: "collect", cents: net };
  if (net < 0) return { direction: "refund", cents: -net };
  return { direction: "none", cents: 0 };
}

export function describeSettlement(s: Settlement, euros: (cents: number) => string): string {
  if (s.direction === "collect") return `À réclamer au restaurateur : ${euros(s.cents)}`;
  if (s.direction === "refund") return `À rendre au restaurateur : ${euros(s.cents)}`;
  return "Rien à régler";
}
