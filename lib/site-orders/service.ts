// ADR 0099 §2 — passer une commande du site, la lire, changer son état. La base est derrière une interface (`OrdersDb`)
// pour être testée sans Supabase. Aucune règle de prix ici : tout vient de `order.ts`.

import type { OptionGroup } from "../menu-options/types";
import {
  brusselsDay, canTransition, checkRequest, formatNumber, isOrderStatus, priceOrder, readLines,
  type CatalogItem, type OrderLine, type OrderStatus, type RefusalCode,
} from "./order";

export class SiteOrdersUnavailableError extends Error {
  constructor() {
    super("Les commandes du site ne sont pas encore activées.");
    this.name = "SiteOrdersUnavailableError";
  }
}

export type NewOrderRow = {
  restaurant_id: string; order_day: string; number: number; first_name: string; phone: string;
  lines: OrderLine[]; total_cents: number;
};

export type OrderRow = {
  id: string; number: number; first_name: string; phone: string | null; lines: unknown; total_cents: number; status: string;
  created_at: string; ready_at: string | null; picked_up_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
};

export interface OrdersDb {
  loadCatalog(restaurantId: string, ids: string[]): Promise<Map<string, CatalogItem>>;
  loadTrees(restaurantId: string, ids: string[]): Promise<Map<string, OptionGroup[]>>;
  /** Le plus grand numéro déjà pris ce jour-là (0 si aucun). */
  lastNumber(restaurantId: string, day: string): Promise<number>;
  /** `conflict` = ce numéro vient d'être pris par une autre commande : on réessaie avec le suivant. */
  insert(row: NewOrderRow): Promise<{ ok: true; id: string } | { ok: false; conflict: true }>;
  recordRefusal(restaurantId: string, reason: string): Promise<void>;
  listOrders(restaurantId: string, sinceIso: string): Promise<OrderRow[]>;
  /** Change l'état SEULEMENT si la commande est encore dans l'état `from` ; renvoie `false` sinon. */
  transition(restaurantId: string, id: string, from: OrderStatus, patch: Record<string, unknown>): Promise<boolean>;
  getStatus(restaurantId: string, id: string): Promise<OrderStatus | null>;
}

export type PlaceOutcome =
  | { ok: true; id: string; number: string; totalCents: number }
  | { ok: false; status: number; code: RefusalCode; message: string };

const MAX_NUMBER_TRIES = 4;

/** Reçoit une commande : forme, plats, choix, prix recalculé, numéro du jour. Rien n'est écrit si quoi que ce soit est faux. */
export async function placeSiteOrder(db: OrdersDb, restaurantId: string, raw: unknown, now: Date = new Date()): Promise<PlaceOutcome> {
  const checked = checkRequest(raw);
  if (!checked.ok) return { ok: false, status: 400, code: checked.code, message: checked.message };
  const { request } = checked;
  const ids = [...new Set(request.lines.map((l) => l.articleId))];

  let catalog: Map<string, CatalogItem>;
  let trees: Map<string, OptionGroup[]>;
  try {
    [catalog, trees] = await Promise.all([db.loadCatalog(restaurantId, ids), db.loadTrees(restaurantId, ids)]);
  } catch (e) {
    if (e instanceof SiteOrdersUnavailableError) return { ok: false, status: 503, code: "indisponible", message: e.message };
    console.error("[site-orders] lecture du catalogue :", e);
    return { ok: false, status: 500, code: "indisponible", message: "Un souci de notre côté. Réessaie dans un instant, ou appelle le restaurant." };
  }

  const priced = priceOrder(request, catalog, trees);
  if (!priced.ok) return { ok: false, status: 422, code: priced.code, message: priced.message };

  const day = brusselsDay(now);
  try {
    for (let i = 0; i < MAX_NUMBER_TRIES; i++) {
      const number = (await db.lastNumber(restaurantId, day)) + 1;
      const r = await db.insert({
        restaurant_id: restaurantId, order_day: day, number, first_name: request.firstName, phone: request.phone,
        lines: priced.lines, total_cents: priced.totalCents,
      });
      if (r.ok) return { ok: true, id: r.id, number: formatNumber(number), totalCents: priced.totalCents };
    }
    return { ok: false, status: 503, code: "indisponible", message: "Beaucoup de commandes en même temps. Réessaie dans un instant." };
  } catch (e) {
    if (e instanceof SiteOrdersUnavailableError) return { ok: false, status: 503, code: "indisponible", message: e.message };
    console.error("[site-orders] écriture :", e);
    return { ok: false, status: 500, code: "indisponible", message: "Un souci de notre côté. Réessaie dans un instant, ou appelle le restaurant." };
  }
}

export type OrderView = {
  id: string; number: string; firstName: string; phone: string | null; lines: OrderLine[]; totalCents: number; status: OrderStatus;
  createdAt: string; readyAt: string | null; pickedUpAt: string | null; cancelledAt: string | null; cancelReason: string | null;
};

export function viewOf(r: OrderRow): OrderView {
  return {
    id: r.id, number: formatNumber(r.number), firstName: r.first_name, phone: r.phone, lines: readLines(r.lines), totalCents: r.total_cents,
    status: isOrderStatus(r.status) ? r.status : "recue", createdAt: r.created_at, readyAt: r.ready_at, pickedUpAt: r.picked_up_at,
    cancelledAt: r.cancelled_at, cancelReason: r.cancel_reason,
  };
}

/** Les commandes des dernières 24 h, les plus récentes d'abord (la console les trie ensuite par état). */
export async function listRecentOrders(db: OrdersDb, restaurantId: string, now: Date = new Date()): Promise<OrderView[]> {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  return (await db.listOrders(restaurantId, since)).map(viewOf);
}

export type TransitionOutcome = { ok: true } | { ok: false; status: number; error: string };

/** Fait avancer une commande : « prête », « retirée » ou « annulée » (avec une raison). Un état déjà dépassé est refusé, jamais écrasé. */
export async function changeStatus(db: OrdersDb, restaurantId: string, id: string, to: unknown, reason: unknown, now: Date = new Date()): Promise<TransitionOutcome> {
  if (!isOrderStatus(to) || to === "recue") return { ok: false, status: 400, error: "État inconnu." };
  const from = await db.getStatus(restaurantId, id);
  if (from === null) return { ok: false, status: 404, error: "Commande introuvable. Recharge la page." };
  if (!canTransition(from, to)) return { ok: false, status: 409, error: "Cette commande a déjà changé d'état. Recharge la page." };
  const iso = now.toISOString();
  const patch: Record<string, unknown> = { status: to };
  if (to === "prete") patch.ready_at = iso;
  if (to === "retiree") patch.picked_up_at = iso;
  if (to === "annulee") {
    patch.cancelled_at = iso;
    const r = typeof reason === "string" ? reason.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200) : "";
    patch.cancel_reason = r === "" ? null : r;
  }
  // Deux personnes qui cliquent en même temps : la seconde trouve l'état déjà changé et le voit.
  const ok = await db.transition(restaurantId, id, from, patch);
  return ok ? { ok: true } : { ok: false, status: 409, error: "Cette commande a déjà changé d'état. Recharge la page." };
}
