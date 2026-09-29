// ============================================================
// Est-ce bien un ticket ? — une seule règle pour l'aperçu du visiteur
// (/api/orders/parse-receipt) et l'envoi du membre (/api/orders), qui lit
// la photo lui-même depuis l'ADR 0058 §4.
//
// Incident 2026-09-02 (49 refus sur 70 scans à Kraainem) : la clé de commande
// lue prouve le ticket MIEUX que le nom du resto en haut — elle suit le format
// propre à l'établissement (ADR 0019), sa date est vérifiée et elle ne sert
// qu'une fois. Le Bestelnummer étant imprimé EN BAS des tickets de borne,
// exiger l'en-tête punissait le bon cadrage (total + numéro).
//
// Refus des photos d'affiche (backlog 2026-09-10) : l'affiche porte le nom du
// resto, l'en-tête seule ne la départage donc pas d'un ticket. Une clé lue,
// elle, prouve un ticket quelle que soit la lecture « affiche » du modèle.
//
// Pur, sans dépendance serveur : testé dans receipt-proof.test.ts.
// ============================================================

import type { KeyIssue, ReceiptAnalysis } from "./receipt-ocr";

export type ReceiptVerdict = "receipt" | "poster" | "not_a_receipt";

export function judgeReceipt(
  analysis: Pick<ReceiptAnalysis, "order_number" | "has_restaurant_header" | "looks_like_qr_or_poster">
): ReceiptVerdict {
  if (analysis.looks_like_qr_or_poster && analysis.order_number === null) return "poster";
  if (!analysis.has_restaurant_header && analysis.order_number === null) return "not_a_receipt";
  return "receipt";
}

/** Refus d'une photo sans ticket reconnu : dit quoi cadrer, avec les mots de l'établissement. */
export function notAReceiptMessage(restaurantName: string, keyLabel: string | null): string {
  return `On n'a pas reconnu de ticket ${restaurantName} sur cette photo. Cadre la zone du total et du ${keyLabel ?? "numéro de commande"}, de près et bien à plat — pas besoin de tout le ticket.`;
}

/**
 * Refus d'un ticket dont la clé porte le code d'un AUTRE établissement (ADR 0073).
 * Ne nomme jamais l'autre établissement : le code le désignerait (ADR 0025), et
 * le membre n'a rien à corriger sur sa photo — refaire la photo ne changerait rien.
 */
export function otherEstablishmentMessage(restaurantName: string): string {
  return `Ce ticket ne vient pas de ${restaurantName}. Le programme ne compte que les tickets de l'établissement où tu es.`;
}

/** Vrai quand la clé lue est celle d'un autre établissement : refus définitif, pas de nouvelle photo à demander. */
export function isOtherEstablishment(analysis: { key_issue?: KeyIssue | null }): boolean {
  return analysis.key_issue === "other_establishment";
}

/**
 * Le motif de l'entonnoir (`ticket_rejected`) d'un refus de lecture. Un code
 * d'établissement inconnu (ADR 0073) a son propre motif : c'est presque toujours
 * une clé mal lue, et on veut le compter à part pour voir si la règle se trompe.
 *
 * @param kind `not_a_receipt` : ni clé ni en-tête reconnus ; `incomplete` : ticket reconnu mais total ou clé manquant
 */
export function refusalReason(
  analysis: Pick<ReceiptAnalysis, "amount"> & { key_issue?: KeyIssue | null },
  kind: "not_a_receipt" | "incomplete"
): "unreadable" | "header_rejected" | "key_code_unknown" {
  if (analysis.key_issue === "unknown_code") return "key_code_unknown";
  if (kind === "incomplete") return "unreadable";
  return analysis.amount === null ? "unreadable" : "header_rejected";
}
