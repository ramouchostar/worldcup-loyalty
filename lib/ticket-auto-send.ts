// ============================================================
// Envoi automatique du ticket (ADR 0055).
//
// Terrain 2026-09-14 : beaucoup de tickets photographiés ne sont jamais
// envoyés. Après la photo, l'écran de scan d'un membre gardait le titre
// « Prends ton ticket en photo » et la photo pleine taille ; le bouton
// « Envoyer mon ticket » tombait sous la ligne de flottaison, derrière la
// barre du bas. La personne croyait avoir fini et quittait l'app.
//
// ADR 0058 — il n'y a plus de récap : ni le montant ni le numéro ne se
// saisissent. Une lecture incomplète (total ou numéro absent, année du numéro
// réparée) se reprend en photo.
//
// ADR 0058 §4 — la photo du membre est lue UNE fois, par le serveur : cette
// règle est appliquée par /api/orders, qui renvoie `missing` à l'écran.
//
// Client-safe : aucune dépendance serveur.
// ============================================================

import { validateAmount } from "@/lib/orders";

/** Ce que la lecture OCR renvoie et qui décide. */
export type ReceiptReading = {
  order_number?: string | null;
  amount?: number | null;
  key_corrected?: boolean;
  has_reliable_key?: boolean;
};

/** Ce que la photo n'a pas su montrer. */
export type MissingParts = { total: boolean; key: boolean };

/**
 * ADR 0057 — une photo lue mais incomplète se REPREND : on dit quoi recadrer
 * (le total, la clé, ou les deux). `null` = rien ne manque, le ticket part.
 *
 * - montant lu et dans les bornes (> 0, ≤ 500) ;
 * - numéro lu, sauf si l'établissement n'a pas de clé fiable (le numéro est
 *   alors ignoré et la commande part en revue quoi qu'il arrive) ;
 * - année du numéro NON réparée : une réparation (incident Kasia) se refait
 *   par une nouvelle photo, jamais par une saisie (ADR 0058).
 */
export function missingReceiptParts(reading: ReceiptReading): MissingParts | null {
  const total = typeof reading.amount !== "number" || validateAmount(reading.amount) !== null;
  // ADR 0058 — une année réparée compte comme une clé manquante : même
  // issue, une nouvelle photo.
  const key =
    reading.has_reliable_key !== false &&
    (reading.key_corrected === true ||
      !(typeof reading.order_number === "string" && reading.order_number.trim().length > 0));
  return total || key ? { total, key } : null;
}
