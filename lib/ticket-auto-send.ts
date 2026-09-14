// ============================================================
// Envoi automatique du ticket (ADR 0055).
//
// Terrain 2026-09-14 : beaucoup de tickets photographiés ne sont jamais
// envoyés. Après la photo, l'écran de scan d'un membre gardait le titre
// « Prends ton ticket en photo » et la photo pleine taille ; le bouton
// « Envoyer mon ticket » tombait sous la ligne de flottaison, derrière la
// barre du bas. La personne croyait avoir fini et quittait l'app.
//
// Le récap « Montant · Numéro » ne sert qu'aux lectures qu'un humain peut
// réparer. Le serveur relit le ticket lui-même (/api/orders) : un montant
// corrigé à la main ne valide rien, il part en revue (amount_mismatch). Seul
// le NUMÉRO compte — s'il manque ou si son année a été réparée, on montre le
// récap ; sinon le ticket part tout seul.
//
// Client-safe : aucune dépendance serveur.
// ============================================================

import { validateAmount } from "@/lib/orders";

/** Ce que l'aperçu OCR (/api/orders/parse-receipt) renvoie et qui décide. */
export type ReceiptReading = {
  order_number?: string | null;
  amount?: number | null;
  key_corrected?: boolean;
  has_reliable_key?: boolean;
};

/**
 * Le ticket peut-il partir sans relecture ?
 *
 * - montant lu et accepté par le serveur (> 0, ≤ 500) ;
 * - numéro lu, sauf si l'établissement n'a pas de clé fiable : le serveur
 *   ignore alors le numéro et envoie en revue quoi qu'il arrive, le récap
 *   n'aurait rien à corriger ;
 * - année du numéro NON réparée par le serveur : c'est l'incident Kasia, la
 *   personne doit comparer avec son ticket.
 *
 * Le doublon se vérifie à part (/api/orders/precheck, réseau).
 */
export function canAutoSend(reading: ReceiptReading): boolean {
  if (typeof reading.amount !== "number" || validateAmount(reading.amount) !== null) return false;
  if (reading.key_corrected === true) return false;
  if (reading.has_reliable_key === false) return true;
  return typeof reading.order_number === "string" && reading.order_number.trim().length > 0;
}
