// ADR 0112 — « le restaurateur a été prévenu » : ce qu'il faut voir dans le journal des messages (`message_sends`)
// avant de publier sans lui. PUR, testé.
//
// RÈGLE : seul un message DÉLIVRÉ compte (accusé du fournisseur, reçu par le webhook), sans rebond ni plainte.
// « Envoyé » veut seulement dire que le fournisseur a accepté de l'expédier : l'adresse peut encore être en échec.
// Conséquence assumée : si le webhook ne reçoit plus rien, rien ne part, et la raison le dit.

import type { AutoReason } from "./reasons";

export type SendProof = {
  status: string;
  delivered_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
};

export type ProofVerdict = { ok: true } | { ok: false; reason: AutoReason };

/** `null` : aucune ligne au journal pour ce message. */
export function deliveryProof(row: SendProof | null): ProofVerdict {
  if (!row) return { ok: false, reason: "mail_non_parti" };
  if (row.status === "bounced" || row.bounced_at !== null || row.status === "complained" || row.complained_at !== null) {
    return { ok: false, reason: "mail_rebond" };
  }
  if (row.status === "failed" || row.status === "holdout") return { ok: false, reason: "mail_non_parti" };
  if (row.status === "delivered" || row.delivered_at !== null) return { ok: true };
  return { ok: false, reason: "mail_non_confirme" };
}
