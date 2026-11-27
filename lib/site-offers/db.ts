// ADR 0110 — la base des offres (service role uniquement : tables sans policy ; SERVEUR UNIQUEMENT). Tables ou colonnes
// absentes (migration 20261127-1400 pas appliquée) = `OffersUnavailableError` : la page de commande reste comme avant et la
// console dit « pas encore activé ».

import { loadOptionTrees } from "../menu-options/store";
import { isOrderable } from "../site-orders/menu";
import { createAdminClient } from "../supabase";
import type { OfferRow } from "./offers";
import { OffersUnavailableError, type OffersDb } from "./service";

type DbError = { code?: string; message?: string };

export const isMissingOfferSchema = (error: DbError | null) =>
  !!error &&
  (error.code === "PGRST205" ||
    error.code === "42P01" ||
    ((error.code === "PGRST204" || error.code === "42703") && /offer/i.test(error.message ?? "")) ||
    /(site_offer\w*|offer_ids?).*(does not exist|schema cache)|Could not find the (table|column).*(site_offer|offer_id)/i.test(error.message ?? ""));

const fail = (what: string, error: DbError): Error =>
  isMissingOfferSchema(error) ? new OffersUnavailableError() : new Error(`offres (${what}) : ${error.message}`);

export function supabaseOffersDb(): OffersDb {
  const admin = createAdminClient();
  const offers = () => admin.from("site_offers");
  const rows = (data: unknown) => (data ?? []) as OfferRow[];

  return {
    async list(restaurantId) {
      const { data, error } = await offers().select("*").eq("restaurant_id", restaurantId).order("updated_at", { ascending: false }).limit(100);
      if (error) throw fail("liste", error);
      return rows(data);
    },
    async published(restaurantId, sinceDay) {
      const { data, error } = await offers().select("*").eq("restaurant_id", restaurantId).eq("state", "publiee").gte("last_day", sinceDay).limit(200);
      if (error) throw fail("offres publiées", error);
      return rows(data);
    },
    async get(restaurantId, id) {
      const { data, error } = await offers().select("*").eq("restaurant_id", restaurantId).eq("id", id).maybeSingle();
      if (error) throw fail("lecture", error);
      return (data as OfferRow | null) ?? null;
    },
    async byIds(restaurantId, ids) {
      if (ids.length === 0) return [];
      const { data, error } = await offers().select("*").eq("restaurant_id", restaurantId).in("id", ids);
      if (error) throw fail("lecture", error);
      return rows(data);
    },
    async insert(row) {
      const { data, error } = await offers().insert({ ...row, state: "brouillon" }).select("*").single();
      if (error) throw fail("création", error);
      return data as OfferRow;
    },
    async update(id, patch, expect) {
      const { data, error } = await offers().update(patch).eq("id", id).eq("state", expect).select("*").maybeSingle();
      if (error) throw fail("écriture", error);
      return (data as OfferRow | null) ?? null;
    },
    async orderable(restaurantId, itemIds) {
      const { data, error } = await admin.from("menu_items").select("id, menu_price, is_active").eq("restaurant_id", restaurantId).in("id", itemIds);
      if (error) throw new Error(`offres (plats) : ${error.message}`);
      const found = (data ?? []) as { id: string; menu_price: number | string; is_active: boolean }[];
      const trees = await loadOptionTrees(restaurantId, found.map((r) => r.id));
      return new Set(found.filter((r) => isOrderable(r, trees.get(r.id) ?? [])).map((r) => r.id));
    },
    async dishNames(restaurantId, itemIds) {
      if (itemIds.length === 0) return new Map();
      const { data, error } = await admin.from("menu_items").select("id, name").eq("restaurant_id", restaurantId).in("id", itemIds);
      if (error) throw new Error(`offres (noms des plats) : ${error.message}`);
      return new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
    },
    async addSeen(restaurantId, kind, offerIds) {
      const { error } = await admin.from("site_offer_events").insert(offerIds.map((offer_id) => ({ offer_id, restaurant_id: restaurantId, kind })));
      if (error) throw fail("compteur", error);
    },
    async saveAnswer({ restaurantId, offerId, orderId, answer, at }) {
      const { error } = await admin
        .from("site_offer_events")
        .upsert({ offer_id: offerId, restaurant_id: restaurantId, kind: answer, order_id: orderId, created_at: at }, { onConflict: "offer_id,order_id" });
      if (error) throw fail("réponse du comptoir", error);
    },
    async orderOfferIds(restaurantId, orderId) {
      const { data, error } = await admin.from("site_orders").select("offer_ids").eq("restaurant_id", restaurantId).eq("id", orderId).maybeSingle();
      if (error) throw fail("commande", error);
      return data ? ((data as { offer_ids: string[] | null }).offer_ids ?? []) : null;
    },
  };
}

/** Combien de fois chaque offre a été affichée, ouverte, et combien de commandes l'ont reçue. `null` = illisible. */
export type OfferCounts = { seen: number; opened: number; orders: number };

export async function readOfferCounts(restaurantId: string, offerIds: string[]): Promise<Map<string, OfferCounts> | null> {
  const admin = createAdminClient();
  const out = new Map<string, OfferCounts>();
  try {
    await Promise.all(
      offerIds.map(async (id) => {
        const event = (kind: "affichee" | "ouverte") =>
          admin.from("site_offer_events").select("id", { count: "exact", head: true }).eq("offer_id", id).eq("kind", kind);
        const [seen, opened, orders] = await Promise.all([
          event("affichee"),
          event("ouverte"),
          admin.from("site_orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).contains("offer_ids", [id]),
        ]);
        const error = seen.error ?? opened.error ?? orders.error;
        if (error) throw new Error(error.message);
        out.set(id, { seen: seen.count ?? 0, opened: opened.count ?? 0, orders: orders.count ?? 0 });
      }),
    );
  } catch (e) {
    console.error("[site-offers] compteurs illisibles :", (e as Error).message);
    return null;
  }
  return out;
}

/** Les réponses du comptoir pour ces commandes : « commande/offre » → réponse. */
export async function readOfferAnswers(restaurantId: string, orderIds: string[]): Promise<Map<string, "appliquee" | "pas_appliquee">> {
  if (orderIds.length === 0) return new Map();
  const { data, error } = await createAdminClient().from("site_offer_events").select("offer_id, order_id, kind").eq("restaurant_id", restaurantId).in("order_id", orderIds);
  if (error) throw fail("réponses du comptoir", error);
  return new Map(((data ?? []) as { offer_id: string; order_id: string; kind: "appliquee" | "pas_appliquee" }[]).map((r) => [`${r.order_id}/${r.offer_id}`, r.kind]));
}

/** Les prénoms des personnes qui ont publié, pour la console ; une panne rend une liste vide (la carte dit la date seule). */
export async function readFirstNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await createAdminClient().from("profiles").select("id, display_name").in("id", userIds);
  if (error) {
    console.error("[site-offers] prénoms illisibles :", error.message);
    return new Map();
  }
  return new Map(
    ((data ?? []) as { id: string; display_name: string | null }[]).flatMap((p) => {
      const first = p.display_name?.trim().split(/\s+/)[0];
      return first ? [[p.id, first] as const] : [];
    }),
  );
}

/** Suppression de compte : les auteurs sont détachés, l'offre (au nom du restaurant) reste. Table absente = rien à faire. */
export async function detachOfferAuthors(userId: string): Promise<{ message?: string } | null> {
  const admin = createAdminClient();
  for (const column of ["created_by", "published_by", "stopped_by"] as const) {
    const { error } = await admin.from("site_offers").update({ [column]: null }).eq(column, userId);
    if (error && !isMissingOfferSchema(error)) return error;
  }
  return null;
}
