// ============================================================
// Tickets définitivement refusés, avec leur message (ADR 0098) — pur, testé.
//
// Décision du porteur (2026-11-10) : les tickets de livraison (Uber Eats, Deliveroo, « Livraison »)
// et ceux de Belchicken Ixelles ne sont JAMAIS acceptés. Pas de nouvelle photo à demander : refaire
// la photo ne change rien. Chaque cas a son message, plutôt que « reprends la photo ».
//
// Mesure sur 60 jours : 25 scans avec un canal « Livraison » (aucun n'a de clé lue, 9 sont passés
// à l'aperçu sans refus), code 234 (Ixelles) lu 11 fois.
// ============================================================

/** Établissements qui ne font pas partie du programme, reconnus par le code de leur clé. */
export const NOT_IN_PROGRAM_BY_CODE: Readonly<Record<string, string>> = {
  "234": "Belchicken Ixelles",
};

// Canal imprimé d'un ticket de livraison : « Livraison », « LIVRAISON », « Uber Eats Livraison »,
// « Deliveroo »… Pas « Take away » (à emporter, accepté) ni « Collection ».
const DELIVERY_CHANNEL = /livr|deliver|uber\s*eats|deliveroo|just\s*eat|thuisbezorgd|bezorg/i;

export function isDeliveryChannel(channel: string | null | undefined): boolean {
  return !!channel && DELIVERY_CHANNEL.test(channel);
}

/** Le nom de l'établissement hors programme dont la clé porte ce code, ou null. */
export function outsideProgramByCode(key: string | null | undefined): string | null {
  const m = String(key ?? "").match(/^\d{4}-\d{1,2}-\d{1,2}\/(\d+)\//);
  return m ? NOT_IN_PROGRAM_BY_CODE[m[1]] ?? null : null;
}

export const DELIVERY_TICKET_MESSAGE =
  "Les tickets de livraison (Uber Eats, Deliveroo, livraison à domicile) ne sont pas acceptés : le programme est réservé aux commandes passées au restaurant.";

/** `label` vient de notre liste ou de la base, jamais du texte lu sur la photo. */
export function outsideProgramMessage(label: string, restaurantName: string): string {
  return `Les tickets de ${label} ne sont pas acceptés dans ce programme. Utilise un ticket de ${restaurantName}.`;
}
