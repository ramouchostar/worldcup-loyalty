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
import type { RejectionReason } from "./funnel";
import { missingReceiptParts } from "./ticket-auto-send";

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
  return `On n'a pas reconnu de ticket ${restaurantName} sur cette photo. ${keyFramingHint(keyLabel)}`;
}

/**
 * Où se trouve la clé, et quoi cadrer. Audit des refus 2026-10-19 : des membres
 * photographiaient le reçu de carte (« EFT »), en bas du ticket — il porte aussi un
 * « Total » mais pas le numéro de commande, qui est plus haut. Cinq essais de suite
 * sur la même moitié de ticket.
 */
export function keyFramingHint(keyLabel: string | null): string {
  const name = keyLabelForMember(keyLabel);
  // Le reçu « EFT » et la place du numéro sont ceux des tickets de borne Belchicken, dont
  // l'étiquette est néerlandaise : pour un autre établissement on ne promet pas où est la clé.
  if (!isDutchLabel(keyLabel)) {
    return `Cadre le ${name} et le total, de près et bien à plat, sans le reçu de paiement par carte.`;
  }
  return `Le ${name} est imprimé dans le haut du ticket, avec le total — pas sur le reçu de paiement par carte (« EFT »). Cadre cette partie, de près et bien à plat.`;
}

const DUTCH_KEY_LABEL = /bestelnummer|bestelling|ordernummer/i;
function isDutchLabel(keyLabel: string | null): boolean {
  return !!keyLabel && DUTCH_KEY_LABEL.test(keyLabel);
}

/**
 * Comment nommer la clé à un membre. L'étiquette « Bestelnummer » est celle des tickets
 * imprimés en néerlandais (Kraainem, en Flandre) ; un membre francophone doit aussi lire
 * « numéro de commande » : on met les deux. Un autre établissement garde sa propre étiquette.
 */
export function keyLabelForMember(keyLabel: string | null): string {
  if (!keyLabel) return "numéro de commande";
  return isDutchLabel(keyLabel) ? `numéro de commande (« ${keyLabel} »)` : keyLabel;
}

/**
 * Le motif exact du refus d'une lecture, dans l'ordre où les routes refusent — ou
 * null si la lecture passe. Écrit sur le scan (`receipt_scans.refusal_reason`) : la
 * cause d'un refus se lit scan par scan, plus seulement en total par jour.
 *
 * @param checkCompleteness vrai pour l'envoi du membre (total et clé exigés, ADR 0058) ;
 *   faux pour l'aperçu du visiteur, qui ne refuse pas une lecture incomplète.
 */
export function scanRefusalReason(
  analysis: Pick<ReceiptAnalysis, "amount" | "order_number" | "key_corrected" | "has_restaurant_header" | "looks_like_qr_or_poster"> & {
    key_issue?: KeyIssue | null;
  },
  opts: { checkCompleteness: boolean; hasReliableKey?: boolean }
): RejectionReason | null {
  if (isOtherEstablishment(analysis)) return "wrong_establishment";
  const verdict = judgeReceipt(analysis);
  if (verdict === "poster") return "qr_detected";
  if (verdict === "not_a_receipt") return refusalReason(analysis, "not_a_receipt");
  if (analysis.key_issue === "unknown_code") return "key_code_unknown";
  if (
    opts.checkCompleteness &&
    missingReceiptParts({
      amount: analysis.amount,
      order_number: analysis.order_number,
      key_corrected: analysis.key_corrected,
      has_reliable_key: opts.hasReliableKey,
    })
  ) {
    return refusalReason(analysis, "incomplete");
  }
  return null;
}

/**
 * Refus d'un ticket dont la clé porte un code d'établissement que PERSONNE ne reconnaît
 * (ADR 0073 : `unknown_code`). Audit 2026-10-19 : 14 refus, des tickets d'autres
 * Belchicken (Ixelles, Uccle) — le refus est juste, le message « reprends la photo »
 * ne l'était pas (un membre a renvoyé le même ticket 8 fois). On dit la vraie cause, sans
 * nommer un autre établissement (ADR 0025) ni afficher le code.
 */
export function unknownCodeMessage(restaurantName: string): string {
  return `Le numéro de commande lu sur ce ticket ne correspond pas à ${restaurantName}. S'il vient d'un autre établissement, il ne compte pas ici. Sinon, reprends la photo du numéro, de près et bien à plat.`;
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
