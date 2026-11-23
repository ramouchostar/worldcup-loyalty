// ADR 0108 §5 — une commande du site retirée rapporte ses points. Les points se créditent DANS LA BASE (déclencheur sur
// `site_orders`, migration 20261123-1000) ; ce fichier ne garde que ce que l'application partage avec elle : la fenêtre « même
// repas » et le motif de revue du ticket. Logique PURE et testée.

/**
 * Un ticket de caisse et une commande du site du MÊME compte, dans le MÊME restaurant, à moins de six heures l'un de l'autre,
 * sont lus comme un seul repas : le second ne rapporte pas de points. Même valeur que la migration (`INTERVAL '6 hours'`) : si
 * l'une change, l'autre change.
 */
export const SITE_ORDER_TICKET_WINDOW_HOURS = 6;

/** Le motif de revue d'un ticket envoyé peu après une commande du site (affiché au restaurateur, orders/page.tsx). */
export const SITE_ORDER_RECENT_FLAG = "site_order_recent";

/** La raison du crédit dans le registre `point_transactions`. */
export const SITE_ORDER_POINTS_REASON = "site_order_points";

/** À partir de quand une commande du site compte comme « récente » pour un ticket envoyé à `now` (ISO, pour une requête). */
export const recentSiteOrderSince = (now: Date): string => new Date(now.getTime() - SITE_ORDER_TICKET_WINDOW_HOURS * 3600 * 1000).toISOString();

/** Les états d'une commande du site qui comptent comme « un repas en cours ou fait » : tout sauf annulée. */
export const SITE_ORDER_LIVE_STATUSES = ["recue", "prete", "retiree"] as const;
