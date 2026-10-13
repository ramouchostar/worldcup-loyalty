// ============================================================
// Réserver un prestataire (ADR 0084 §4) — le litige : l'ouvrir, le trancher, ce que ça rend.
//
// Quand le restaurateur conteste un compte-rendu, quand la livraison ne convient à personne, quand un tournage s'est
// mal passé, c'est la PLATEFORME qui arbitre. Rien n'est automatique pendant un litige (ni rappel, ni validation).
// Trois décisions :
//   verser    la livraison est conforme : elle est validée, le prestataire sera payé en entier ;
//   rembourser le restaurateur est remboursé en entier, avec ou sans sanction du prestataire ;
//   partager  le prestataire reçoit une part (1 à 99 %) de ce qu'il aurait reçu, le reste est rendu.
// (Une « retouche supplémentaire offerte » n'existe pas dans cette version : elle exigerait un compteur de tours à part.)
// Fonctions PURES.
// ============================================================

import { canTransition, type MissionStatus } from "./mission-states";
import type { ProviderSanction } from "./mission-cancellation";

/** Les états d'où l'on peut ouvrir un litige : de l'acompte à la dernière retouche. Pas après validation (le versement est dû). */
const OPENABLE: readonly MissionStatus[] = ["accepte", "date_bloquee", "production", "livre", "retouche"];

export function canOpenDispute(status: MissionStatus): boolean {
  return OPENABLE.includes(status) && canTransition(status, "litige", "platform").ok;
}

export const MIN_DISPUTE_TEXT = 10;
export const MAX_DISPUTE_TEXT = 1_000;

export function validateDisputeText(raw: unknown): { ok: true; text: string } | { ok: false; issue: "too_short" | "too_long" } {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (t.length < MIN_DISPUTE_TEXT) return { ok: false, issue: "too_short" };
  if (t.length > MAX_DISPUTE_TEXT) return { ok: false, issue: "too_long" };
  return { ok: true, text: t };
}

export type Decision = "pay" | "refund" | "split";
export const DECISION_LABELS: Record<Decision, { title: string; sub: string }> = {
  pay: { title: "Verser au prestataire", sub: "Le travail respecte le brief : la livraison est validée, il sera payé en entier." },
  refund: { title: "Rembourser le restaurateur", sub: "Le prestataire n'a pas tenu son devis : le restaurateur est remboursé en entier." },
  split: { title: "Partager", sub: "Une part pour le prestataire, le reste est rendu au restaurateur." },
};

export type ResolveInput = { decision: Decision; providerPct: number | null; sanction: ProviderSanction; note: string };
export type ResolveIssue = "decision_unknown" | "pct_invalid" | "note_invalid" | "sanction_unknown" | "pay_needs_delivery" | "sanction_not_allowed";

export function sanitizeResolve(raw: unknown): { decision: string; providerPct: number | null; sanction: string; note: string } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pct = typeof o.providerPct === "number" ? o.providerPct : typeof o.providerPct === "string" && o.providerPct.trim() !== "" ? Number(o.providerPct.replace(",", ".")) : null;
  return {
    decision: typeof o.decision === "string" ? o.decision : "",
    providerPct: pct !== null && Number.isFinite(pct) ? pct : null,
    sanction: typeof o.sanction === "string" ? o.sanction : "none",
    note: typeof o.note === "string" ? o.note.trim().slice(0, MAX_DISPUTE_TEXT + 1) : "",
  };
}

export function validateResolve(r: { decision: string; providerPct: number | null; sanction: string; note: string }, facts: { hasDelivery: boolean }): { ok: true; input: ResolveInput } | { ok: false; issue: ResolveIssue } {
  if (r.decision !== "pay" && r.decision !== "refund" && r.decision !== "split") return { ok: false, issue: "decision_unknown" };
  if (r.sanction !== "none" && r.sanction !== "avertissement" && r.sanction !== "penalite") return { ok: false, issue: "sanction_unknown" };
  const n = validateDisputeText(r.note);
  if (!n.ok) return { ok: false, issue: "note_invalid" };
  if (r.decision === "pay" && !facts.hasDelivery) return { ok: false, issue: "pay_needs_delivery" };
  // Seul un remboursement ou un partage peut sanctionner le prestataire ; verser en entier n'a pas de faute à sanctionner.
  if (r.decision === "pay" && r.sanction !== "none") return { ok: false, issue: "sanction_not_allowed" };
  if (r.decision === "split" && (r.providerPct === null || !Number.isInteger(r.providerPct) || r.providerPct < 1 || r.providerPct > 99)) return { ok: false, issue: "pct_invalid" };
  return { ok: true, input: { decision: r.decision, providerPct: r.decision === "split" ? r.providerPct : null, sanction: r.sanction as ProviderSanction, note: n.text } };
}

export const RESOLVE_ISSUE_TEXT: Record<ResolveIssue, string> = {
  decision_unknown: "Choisis une décision.",
  pct_invalid: "Pour partager, indique la part du prestataire, entre 1 et 99 %.",
  note_invalid: "Explique ta décision en quelques mots (10 caractères au moins) : elle est gardée dans le dossier.",
  sanction_unknown: "Choisis une sanction dans la liste.",
  pay_needs_delivery: "Il n'y a pas de livraison à valider : choisis de rembourser ou de partager.",
  sanction_not_allowed: "Verser en entier ne se sanctionne pas : retire la sanction.",
};

// ── Ce que la décision rend ──────────────────────────────────

export type MoneySplit = { refundCents: number; retainedCents: number; providerPayoutCents: number; platformKeepsCents: number };

/**
 * `paidCents` : ce que le restaurateur a payé ; `providerCents` : la part du prestataire. Partager rend (100 − p) % du prix
 * au restaurateur, et verse p % de SA part au prestataire (Boosteats garde p % de la sienne).
 */
export function splitMoney(decision: Exclude<Decision, "pay">, paidCents: number, providerCents: number, providerPct: number | null): MoneySplit {
  if (decision === "refund") return { refundCents: paidCents, retainedCents: 0, providerPayoutCents: 0, platformKeepsCents: 0 };
  const p = Math.min(99, Math.max(1, providerPct ?? 0)) / 100;
  const retained = Math.round(paidCents * p);
  const provider = Math.min(retained, Math.round(providerCents * p));
  return { refundCents: paidCents - retained, retainedCents: retained, providerPayoutCents: provider, platformKeepsCents: retained - provider };
}

// ── Le dossier : ce qui est sous les yeux de l'arbitre ───────

export type DisputeRecord = {
  openedBy: string;
  reason: string;
  previousStatus: string;
  decision?: Decision;
  providerPct?: number | null;
  sanction?: ProviderSanction;
  note?: string;
  resolvedBy?: string;
};

/** Un compte-rendu contesté sans litige ouvert : la plateforme est alertée, mais rien n'est ouvert tant qu'elle ne le décide pas. */
export function needsAttention(m: { status: string; report_contested_at: string | null; report_confirmed_at: string | null }): boolean {
  return !!m.report_contested_at && !m.report_confirmed_at && m.status !== "litige" && m.status !== "annule" && m.status !== "verse";
}
