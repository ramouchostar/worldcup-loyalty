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

/**
 * Corrige l'erreur d'un seul chiffre dans le code d'établissement (ADR 0073, amendé le 2026-10-19).
 *
 * Le code est CONSTANT par établissement et imprimé en tout petit : à De Bue, 17 lectures sur 86
 * donnaient 263 pour 253, et un même ticket a été lu 253 puis 263 (un ticket n'a qu'un code).
 * Refuser ces tickets punit un vrai client, et deux lectures différentes d'un même ticket
 * donnent deux clés — l'anti-doublon ne les rapproche plus.
 *
 * On ramène la clé au code de l'établissement quand le code lu :
 *  - n'est PAS celui de l'établissement, ni celui d'un autre établissement du réseau (un vrai
 *    ticket de Houba lu à Kraainem reste un refus net) ;
 *  - ne diffère que d'UN chiffre (substitution, même position).
 * Un code plus éloigné (Ixelles 234 pour 223 : deux chiffres) reste un refus.
 *
 * @returns la clé corrigée, ou null s'il n'y a rien à corriger
 */
export function repairStoreCode(
  key: string | null | undefined,
  ownCode: string | null | undefined,
  otherCodes: readonly string[]
): string | null {
  const code = storeCodeOf(key);
  if (!ownCode || code === null || code === ownCode || otherCodes.includes(code)) return null;
  if (ownCode.length !== code.length) return null;
  let differing = 0;
  for (let i = 0; i < code.length; i++) if (code[i] !== ownCode[i]) differing++;
  if (differing !== 1) return null;
  return (key as string).trim().replace(`/${code}/`, `/${ownCode}/`);
}
