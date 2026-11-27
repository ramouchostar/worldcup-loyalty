// ADR 0110 — les gestes sur une offre : garder un brouillon, publier, arrêter, répondre au comptoir, compter, et ce que le
// client voit. La base est derrière une interface (`OffersDb`) : db.ts en production, une mémoire dans les tests. Les droits
// de la personne sont vérifiés AVANT, par les routes.

import { brusselsDay } from "../site-orders/order";
import {
  MAX_AT_ONCE, checkOfferFields, crowdedDay, dayName, isOfferAnswer, isOfferId, isStopReason, lastValidDay, publicOffer,
  visibleOffers, type OfferAnswer, type OfferFields, type OfferRow, type PublicOffer,
} from "./offers";

/** Les tables n'existent pas encore (migration 20261127-1400 pas appliquée). */
export class OffersUnavailableError extends Error {
  constructor() {
    super("Les offres ne sont pas encore activées.");
    this.name = "OffersUnavailableError";
  }
}

export type NewOffer = OfferFields & { restaurant_id: string; created_by: string; copied_from: string | null };
export type SeenKind = "affichee" | "ouverte";

export type OffersDb = {
  /** Les offres d'un établissement, la plus récemment touchée d'abord. */
  list(restaurantId: string): Promise<OfferRow[]>;
  /** Les offres publiées dont le dernier jour est `sinceDay` ou après. */
  published(restaurantId: string, sinceDay: string): Promise<OfferRow[]>;
  get(restaurantId: string, id: string): Promise<OfferRow | null>;
  byIds(restaurantId: string, ids: string[]): Promise<OfferRow[]>;
  insert(row: NewOffer): Promise<OfferRow>;
  /** Écrit SEULEMENT si l'offre est encore dans l'état attendu ; `null` sinon. */
  update(id: string, patch: Partial<OfferRow>, expect: OfferRow["state"]): Promise<OfferRow | null>;
  /** Les plats de la liste qui sont commandables aujourd'hui (la règle de la carte). */
  orderable(restaurantId: string, itemIds: string[]): Promise<Set<string>>;
  /** Les noms des plats de CET établissement parmi la liste, proposés ou non. */
  dishNames(restaurantId: string, itemIds: string[]): Promise<Map<string, string>>;
  addSeen(restaurantId: string, kind: SeenKind, offerIds: string[]): Promise<void>;
  /** Une réponse du comptoir par commande et par offre ; la dernière remplace la précédente. */
  saveAnswer(row: { restaurantId: string; offerId: string; orderId: string; answer: OfferAnswer; at: string }): Promise<void>;
  /** Les offres affichées à une commande de cet établissement ; `null` si la commande n'existe pas. */
  orderOfferIds(restaurantId: string, orderId: string): Promise<string[] | null>;
};

export type Done<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };
const refuse = (status: number, error: string) => ({ ok: false as const, status, error });
const NOT_FOUND = () => refuse(404, "Offre introuvable. Recharge la page.");

const dishIds = (offers: readonly Pick<OfferRow, "menu_item_id">[]) => [...new Set(offers.flatMap((o) => o.menu_item_id ?? []))];

/** Les plats commandables parmi ceux que ces offres citent (aucune lecture de la carte sans plat lié). */
export async function orderableFor(db: OffersDb, restaurantId: string, offers: readonly Pick<OfferRow, "menu_item_id">[]): Promise<Set<string>> {
  const ids = dishIds(offers);
  return ids.length === 0 ? new Set() : db.orderable(restaurantId, ids);
}

// ─── Écrire ──────────────────────────────────────────────────────────────────

/** Garde un brouillon : nouveau, ou celui qu'on modifie. Une offre publiée ne se modifie pas (ADR 0110 §3). */
export async function saveDraft(db: OffersDb, p: { restaurantId: string; userId: string; id?: unknown; copiedFrom?: unknown; raw: unknown; now?: Date }): Promise<Done<{ offer: OfferRow }>> {
  const now = p.now ?? new Date();
  const checked = checkOfferFields(p.raw, brusselsDay(now));
  if (!checked.ok) return refuse(400, checked.error);
  const fields = checked.value;
  if (fields.menu_item_id && !(await db.dishNames(p.restaurantId, [fields.menu_item_id])).has(fields.menu_item_id)) {
    return refuse(400, "Ce plat n'est pas sur ta carte : choisis-le de nouveau.");
  }
  if (p.id !== undefined && p.id !== null) {
    const before = isOfferId(p.id) ? await db.get(p.restaurantId, p.id) : null;
    if (!before) return NOT_FOUND();
    if (before.state !== "brouillon") return refuse(409, "Une offre publiée ne se modifie pas : arrête-la, puis reprends-la.");
    const saved = await db.update(before.id, { ...fields, updated_at: now.toISOString() }, "brouillon");
    return saved ? { ok: true, offer: saved } : refuse(409, "Cette offre a changé entre-temps. Recharge la page.");
  }
  const source = isOfferId(p.copiedFrom) ? await db.get(p.restaurantId, p.copiedFrom) : null;
  return { ok: true, offer: await db.insert({ ...fields, restaurant_id: p.restaurantId, created_by: p.userId, copied_from: source?.id ?? null }) };
}

/** « Oui, publier » : la case « Mon équipe est prévenue » cochée, et l'offre recontrôlée à cet instant. */
export async function publishOffer(db: OffersDb, p: { restaurantId: string; userId: string; id: unknown; teamConfirmed: boolean; now?: Date }): Promise<Done<{ offer: OfferRow }>> {
  const now = p.now ?? new Date();
  const today = brusselsDay(now);
  const offer = isOfferId(p.id) ? await db.get(p.restaurantId, p.id) : null;
  if (!offer) return NOT_FOUND();
  if (offer.state !== "brouillon") return refuse(409, "Cette offre n'est plus un brouillon. Recharge la page.");
  if (!p.teamConfirmed) return refuse(400, "Coche la case : ton équipe doit appliquer l'offre au comptoir.");
  // Le brouillon a pu vieillir : il se recontrôle comme à la saisie (mots, dates).
  const checked = checkOfferFields({ title: offer.title, conditions: offer.conditions, itemId: offer.menu_item_id, firstDay: offer.first_day, lastDay: offer.last_day, weekdays: offer.weekdays ?? undefined }, today);
  if (!checked.ok) return refuse(409, checked.error);
  if (offer.menu_item_id && !(await db.orderable(p.restaurantId, [offer.menu_item_id])).has(offer.menu_item_id)) {
    return refuse(409, "Le plat de l'offre n'est pas proposé à la commande : tes clients ne la verraient pas. Choisis-en un autre.");
  }
  const crowded = crowdedDay(offer, await db.published(p.restaurantId, today), today);
  if (crowded) return refuse(409, `Tu as déjà ${MAX_AT_ONCE} offres le ${dayName(crowded)} : arrêtes-en une ou change les dates.`);
  const at = now.toISOString();
  const published = await db.update(offer.id, { state: "publiee", published_by: p.userId, published_at: at, updated_at: at }, "brouillon");
  return published ? { ok: true, offer: published } : refuse(409, "Cette offre a changé entre-temps. Recharge la page.");
}

/** Arrêter, avec sa raison : l'affichage cesse tout de suite. Ouvert à tout siège (ADR 0110 §3). */
export async function stopOffer(db: OffersDb, p: { restaurantId: string; userId: string; id: unknown; reason: unknown; now?: Date }): Promise<Done<{ offer: OfferRow }>> {
  if (!isStopReason(p.reason)) return refuse(400, "Dis pourquoi tu l'arrêtes.");
  const offer = isOfferId(p.id) ? await db.get(p.restaurantId, p.id) : null;
  if (!offer) return NOT_FOUND();
  const now = p.now ?? new Date();
  if (offer.state !== "publiee" || lastValidDay(offer) < brusselsDay(now)) return refuse(409, "Cette offre n'est plus en cours. Recharge la page.");
  const at = now.toISOString();
  const stopped = await db.update(offer.id, { state: "arretee", stopped_by: p.userId, stopped_at: at, stop_reason: p.reason, updated_at: at }, "publiee");
  return stopped ? { ok: true, offer: stopped } : refuse(409, "Cette offre a changé entre-temps. Recharge la page.");
}

/** « Offre appliquée » ou « Pas appliquée », sur la carte d'une commande qui l'avait affichée. */
export async function answerOffer(db: OffersDb, p: { restaurantId: string; orderId: unknown; offerId: unknown; answer: unknown; now?: Date }): Promise<Done<object>> {
  if (!isOfferId(p.orderId) || !isOfferId(p.offerId) || !isOfferAnswer(p.answer)) return refuse(400, "Requête invalide.");
  const shown = await db.orderOfferIds(p.restaurantId, p.orderId);
  if (!shown || !shown.includes(p.offerId)) return refuse(404, "Cette commande n'a pas affiché cette offre. Recharge la page.");
  await db.saveAnswer({ restaurantId: p.restaurantId, offerId: p.offerId, orderId: p.orderId, answer: p.answer, at: (p.now ?? new Date()).toISOString() });
  return { ok: true };
}

// ─── Le client ───────────────────────────────────────────────────────────────

/** Les offres que le serveur juge valables maintenant : ce que la page montre et ce qu'une commande retient. */
export async function liveOffers(db: OffersDb, restaurantId: string, now: Date = new Date()): Promise<OfferRow[]> {
  const today = brusselsDay(now);
  const published = await db.published(restaurantId, today);
  return visibleOffers(published, today, await orderableFor(db, restaurantId, published));
}

export async function publicOffers(db: OffersDb, restaurantId: string, now: Date = new Date()): Promise<PublicOffer[]> {
  return (await liveOffers(db, restaurantId, now)).map((o) => publicOffer(o, brusselsDay(now)));
}

/** Un affichage ou une ouverture déclarés par la page : seulement pour des offres montrées en ce moment. */
export async function recordSeen(db: OffersDb, p: { restaurantId: string; kind: unknown; offerIds: unknown; now?: Date }): Promise<Done<{ counted: number }>> {
  if ((p.kind !== "affichee" && p.kind !== "ouverte") || !Array.isArray(p.offerIds) || p.offerIds.length === 0 || p.offerIds.length > MAX_AT_ONCE) {
    return refuse(400, "Requête invalide.");
  }
  const asked = new Set(p.offerIds.filter(isOfferId));
  const ids = (await liveOffers(db, p.restaurantId, p.now)).map((o) => o.id).filter((id) => asked.has(id));
  if (ids.length > 0) await db.addSeen(p.restaurantId, p.kind, ids);
  return { ok: true, counted: ids.length };
}
