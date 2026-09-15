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

import type { ReceiptAnalysis } from "./receipt-ocr";

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
