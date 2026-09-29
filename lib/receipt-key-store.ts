// ============================================================
// Le code de l'établissement dans la clé du ticket (ADR 0073).
//
// La clé de commande imprimée par la borne a la forme
//     AAAA-MM-JJ / code / numéro          ex. 2026-09-20/223/01645
// Le CODE du milieu est celui de l'établissement : 223 pour Kraainem, 258 pour
// Houba (15 photos sur 15, 133 sur 134 — 2026-09-29). Rien ne le vérifiait :
// un ticket de Houba a été validé à Kraainem (2026-09-17), et sur 82 commandes
// validées à Kraainem, 12 portaient un code qui ne peut pas être le sien.
//
// Pur, sans dépendance serveur : testé dans receipt-key-store.test.ts.
// ============================================================

/** Ce que la clé dit de l'établissement d'où vient le ticket. */
export type KeyStoreVerdict =
  /** Le code est celui de l'établissement. */
  | "ok"
  /** Pas de contrôle possible : établissement dont on ne connaît pas encore le code, ou pas de clé. */
  | "unchecked"
  /** Le code est celui d'un AUTRE de nos établissements : le ticket vient d'ailleurs. */
  | "other_establishment"
  /** Le code n'est celui d'aucun de nos établissements : lecture fausse, le membre reprend la photo. */
  | "unknown_code";

/** Le code du milieu d'une clé `AAAA-MM-JJ/NNN/…`, ou null si la clé n'a pas cette forme. */
export function storeCodeOf(key: string | null | undefined): string | null {
  const m = typeof key === "string" ? key.trim().match(/^\d{4}-\d{1,2}-\d{1,2}\/(\d{3})\/\d+$/) : null;
  return m ? m[1] : null;
}

/**
 * @param key         clé lue (déjà conforme au motif de l'établissement), ou null
 * @param ownCode     code de CET établissement (`restaurant_receipt_config.store_code`), null s'il n'est pas connu
 * @param otherCodes  codes des AUTRES établissements du réseau
 */
export function checkStoreCode(
  key: string | null | undefined,
  ownCode: string | null | undefined,
  otherCodes: readonly string[]
): KeyStoreVerdict {
  const code = storeCodeOf(key);
  if (!ownCode || code === null) return "unchecked";
  if (code === ownCode) return "ok";
  return otherCodes.includes(code) ? "other_establishment" : "unknown_code";
}
