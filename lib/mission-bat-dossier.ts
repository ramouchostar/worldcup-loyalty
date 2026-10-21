// ============================================================
// Réserver un prestataire (ADR 0084 §5 ter) — le bon à tirer, tel que l'arbitre le lit dans le dossier de litige.
//
// Ce qui tranche un litige d'impression : quelle épreuve a été envoyée, ce que le restaurateur a demandé de corriger, et SURTOUT
// ce qu'il a signé (son nom, l'instant, chaque point vérifié). Fonctions PURES : on met en forme, on ne décide rien.
// ============================================================

import { batPhase, type BatCheck, type BatPhase, type ProofStatus } from "./mission-print";

export type DossierProof = {
  round: number;
  status: ProofStatus;
  links: string[];
  message: string | null;
  corrections: { category: string; text: string }[] | null;
  signedName: string | null;
  checks: Record<string, boolean> | null;
  sentAt: string;
  decidedAt: string | null;
  signedAt: string | null;
};

export const PROOF_STATUS_TEXT: Record<ProofStatus, string> = {
  proposed: "En attente de réponse du restaurateur",
  corrections: "Corrections demandées",
  signed: "Signée par le restaurateur",
};

export const PHASE_SUMMARY: Record<BatPhase, string> = {
  none: "Aucune épreuve envoyée : l'imprimeur n'a rien soumis à la signature.",
  awaiting_review: "Une épreuve attend la réponse du restaurateur : rien n'est signé.",
  corrections: "Des corrections ont été demandées : aucune épreuve n'est signée.",
  signed: "Une épreuve est SIGNÉE : c'est exactement ce qui devait être imprimé. Le restaurateur a vérifié chaque point et signé de son nom.",
};

export type SignatureView = { name: string; at: string; ticked: { label: string; done: boolean }[]; allTicked: boolean };

/** Chaque point de la liste de contrôle du brief : coché ou non au moment de la signature. */
export function signatureView(p: DossierProof, checklist: readonly BatCheck[]): SignatureView | null {
  if (p.status !== "signed" || !p.signedName || !p.signedAt) return null;
  const ticked = checklist.map((c) => ({ label: c.label, done: p.checks?.[c.key] === true }));
  return { name: p.signedName, at: p.signedAt, ticked, allTicked: ticked.every((t) => t.done) };
}

export type DossierView = { phase: BatPhase; summary: string; proofs: (DossierProof & { statusText: string; signature: SignatureView | null })[] };

export function batDossier(proofs: readonly DossierProof[], checklist: readonly BatCheck[]): DossierView {
  const phase = batPhase(proofs);
  return {
    phase,
    summary: PHASE_SUMMARY[phase],
    proofs: [...proofs].sort((a, b) => a.round - b.round).map((p) => ({ ...p, statusText: PROOF_STATUS_TEXT[p.status], signature: signatureView(p, checklist) })),
  };
}
