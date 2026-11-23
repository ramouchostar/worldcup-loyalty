// ADR 0108 §2 — le compte derrière une commande du site. Logique PURE et testée : sans React ni réseau.
//
// Pour ENVOYER une commande, il faut un compte Boosteats (e-mail ou Google) ; pour la regarder, non. Quand le compte manque,
// le serveur répond 401 avec le code ci-dessous : la page garde le panier, propose la connexion, et ramène le client à sa
// commande par la même mécanique que le ticket photographié en visiteur (cookie `pending_restaurant_id`, ADR 0040).

import { cleanFirstName } from "../menu-options/tickets";

/** Ce que le serveur répond à une commande sans compte (HTTP 401) : le panier du client n'est pas perdu. */
export const LOGIN_REQUIRED = {
  code: "connexion",
  message: "Connecte-toi pour envoyer ta commande. Ton panier est gardé.",
  /** Le motif tracé dans `site_order_refusals` (ADR 0065) : « connexion demandée », premier étage de l'entonnoir de la connexion. */
  reason: "connexion_demandee",
} as const;

/** Le cookie qui dit : ce visiteur est parti se connecter au milieu d'une commande du site (avec `pending_restaurant_id`). */
export const PENDING_SITE_ORDER_COOKIE = "pending_site_order";

/** Le profil d'un compte supprimé s'appelle ainsi (lib/gdpr.ts) : ce n'est pas un prénom. */
const ERASED_PROFILE_NAME = "Compte supprimé";

/**
 * Le prénom à proposer pour la commande, tiré du nom du compte : le premier mot, 24 lettres au plus. Un nom absent, vide ou
 * celui d'un compte supprimé donne « » (le client le tape). Jamais le nom de famille : un prénom suffit à appeler le client.
 */
export function accountFirstName(displayName: unknown): string {
  if (typeof displayName !== "string") return "";
  const t = displayName.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  if (t === "" || t === ERASED_PROFILE_NAME) return "";
  const first = t.split(" ")[0] ?? "";
  const clean = cleanFirstName(first);
  return clean === "CLIENT" ? "" : clean;
}

/**
 * Où ramener un visiteur qui vient de se connecter, quand il avait choisi un établissement avant (cookie `pending_restaurant_id`) :
 *  - un ticket photographié l'attend : l'écran de scan, qui le reprend (ADR 0040) ;
 *  - une commande du site l'attend : la page de commande, qui retrouve son panier ;
 *  - sinon : la page de l'établissement.
 * Le ticket prime : il expire en 24 h et ne se refait pas, un panier se refait.
 */
export function pendingDestination(restaurantId: string, pending: { ticket: boolean; siteOrder: boolean }): string {
  if (pending.ticket) return `/r/${restaurantId}/submit-order?resume=1`;
  if (pending.siteOrder) return `/commander/${restaurantId}`;
  return `/r/${restaurantId}`;
}
