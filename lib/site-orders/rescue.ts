// ADR 0107 §10 — quand le secours WhatsApp s'affiche-t-il, et comment le compte-t-on. Logique PURE et testée.
//
// Le secours s'affiche quand la commande n'a PAS pu être prise par le serveur pour une raison qui n'est pas la faute du client :
// panne de notre côté (5xx), service pas encore activé, pas de réseau, et plus tard imprimante hors ligne
// (`imprimante_hors_ligne`). Il ne s'affiche JAMAIS pour une erreur que le client peut corriger (prénom vide, choix manquant,
// plat retiré), ni pour la limite par adresse (« limite », 429) : c'est une protection contre l'abus, le secours la contournerait.

/** Les motifs de refus du serveur qui ouvrent le secours. Les autres (forme, prénom, choix, limite…) ne l'ouvrent pas. */
const RESCUE_CODES: ReadonlySet<string> = new Set(["indisponible", "imprimante_hors_ligne"]);

/**
 * Le secours WhatsApp doit-il s'afficher ? `status` = 0 quand le navigateur n'a eu aucune réponse (pas de réseau, serveur
 * injoignable) ; sinon le statut HTTP et, s'il y en a un, le `code` de refus.
 */
export function shouldOfferRescue(status: number, code?: string | null): boolean {
  if (status === 0) return true;
  if (code && RESCUE_CODES.has(code)) return true;
  return status >= 500; // une panne de notre côté, même sans code
}

/** Les événements que la page déclare, et le motif sous lequel ils sont comptés (`site_order_refusals.reason`, 60 lettres au plus). */
export const RESCUE_EVENTS = {
  propose: "secours_propose",
  whatsapp: "whatsapp_touche",
  copie: "message_copie",
} as const;

export type RescueEvent = keyof typeof RESCUE_EVENTS;
