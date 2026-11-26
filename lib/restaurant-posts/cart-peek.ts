// ADR 0111 §1 — « le panier survit à la lecture d'un article ». Les pages d'articles ne font que LIRE le panier que la
// page de commande garde dans le navigateur (même clé, même relecture que lib/site-orders/cart.ts) pour proposer
// « Voir mon panier ». Elles ne l'écrivent ni ne l'effacent jamais.
// ⚠️ La clé est aussi écrite dans la page de commande (components/commander, `site_order_cart:<établissement>`) : si elle
// change là-bas, elle change ici (un test le vérifie).

import { cartCount, restoreCart } from "../site-orders/cart";
import type { PublicMenu } from "../site-orders/menu";

export const cartStorageKey = (restaurantId: string) => `site_order_cart:${restaurantId}`;

/** Combien de plats attendent dans le panier gardé (0 : rien, illisible, trop vieux, ou plus proposé). */
export function savedCartCount(raw: string | null, menu: PublicMenu, now: number = Date.now()): number {
  if (!raw) return 0;
  try {
    return cartCount(restoreCart(JSON.parse(raw) as unknown, menu, now).cart);
  } catch {
    return 0;
  }
}
