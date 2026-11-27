// ADR 0099 §2 — la base des commandes du site (service role uniquement : prénom et téléphone d'un client, des euros).
// Une table absente (migration pas appliquée) se dit « pas encore activé », jamais une erreur obscure.

import { createAdminClient } from "../supabase";
import { loadOptionTrees } from "../menu-options/store";
import { supabaseOffersDb } from "../site-offers/db";
import { OffersUnavailableError, liveOffers } from "../site-offers/service";
import { VIEW_REASON_PREFIX } from "./fiche";
import { readFiche } from "./fiche-db";
import { decideForOrder } from "./hours-source";
import { readPageSettings } from "./page-settings-db";
import type { CatalogItem, OrderStatus } from "./order";
import { SiteOrdersUnavailableError, type NewOrderRow, type OrderRow, type OrdersDb } from "./service";

export const isMissingSiteTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || (/site_order/.test(error.message ?? "") && /(does not exist|Could not find the table)/i.test(error.message ?? "")));

export const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /column .*(does not exist|schema cache)|Could not find the '.*' column/i.test(error.message ?? ""));

export function supabaseOrdersDb(): OrdersDb {
  const admin = createAdminClient();
  const fail = (what: string, error: { message: string }) => new Error(`site_orders (${what}) : ${error.message}`);

  return {
    // La fiche n'est lue que si elle peut changer la réponse : jamais avec les horaires saisis par le restaurant ni pendant une
    // fermeture qu'il a annoncée. Aucun cache (conditions Google Maps Platform).
    async readOpenness(restaurantId, now) {
      return (await decideForOrder(await readPageSettings(restaurantId), () => readFiche(restaurantId), now)).openness;
    },
    async liveOffers(restaurantId, now) {
      try {
        return (await liveOffers(supabaseOffersDb(), restaurantId, now)).map((o) => ({ id: o.id, title: o.title, conditions: o.conditions }));
      } catch (e) {
        if (e instanceof OffersUnavailableError) return []; // migration 20261127-1400 pas appliquée : pas d'offres
        throw e;
      }
    },
    async loadCatalog(restaurantId, ids) {
      // Le coin de cuisine est facultatif (migration 20261113-2300) : sans sa colonne, les plats sortent sur « CUISINE ».
      for (const cols of ["id, name, menu_price, is_active, kitchen_zone", "id, name, menu_price, is_active"]) {
        const { data, error } = await admin.from("menu_items").select(cols).eq("restaurant_id", restaurantId).in("id", ids);
        if (error) {
          if (isMissingColumn(error)) continue;
          throw fail("catalogue", error);
        }
        return new Map(((data ?? []) as unknown as { id: string; name: string; menu_price: number | string; is_active: boolean; kitchen_zone?: string | null }[]).map((r) => [
          r.id, { id: r.id, name: r.name, price: Number(r.menu_price), active: !!r.is_active, zone: r.kitchen_zone ?? null } satisfies CatalogItem,
        ]));
      }
      return new Map();
    },
    loadTrees: (restaurantId, ids) => loadOptionTrees(restaurantId, ids),
    async lastNumber(restaurantId, day) {
      const { data, error } = await admin.from("site_orders").select("number").eq("restaurant_id", restaurantId).eq("order_day", day).order("number", { ascending: false }).limit(1);
      if (error) {
        if (isMissingSiteTable(error)) throw new SiteOrdersUnavailableError();
        throw fail("numéro", error);
      }
      return ((data ?? [])[0] as { number: number } | undefined)?.number ?? 0;
    },
    async insert(row: NewOrderRow) {
      let linked = row.member_id !== null;
      let offersKept = row.offer_ids.length > 0;
      // Une commande sans offre ne dépend pas de la colonne des offres.
      const payload: Partial<NewOrderRow> = { ...row };
      if (!offersKept) delete payload.offer_ids;
      let { data, error } = await admin.from("site_orders").insert(payload).select("id").single();
      // Une colonne pas encore créée (migration 20261120-2000 pour le compte, 20261127-1400 pour les offres) : la commande part
      // quand même, SANS ce lien (fail-open), et le journal le dit : jamais une commande perdue pour une colonne manquante.
      for (const column of ["member_id", "offer_ids"] as const) {
        if (!error || !isMissingColumn(error)) break;
        const missing = (["member_id", "offer_ids"] as const).find((c) => c in payload && payload[c] !== null && (error!.message ?? "").includes(c));
        if (!missing) break;
        console.warn(`[site-orders] colonne ${missing} absente (migration à appliquer) : commande enregistrée sans elle.`);
        delete payload[missing];
        if (missing === "member_id") linked = false;
        else offersKept = false;
        ({ data, error } = await admin.from("site_orders").insert(payload).select("id").single());
      }
      if (error) {
        if (isMissingSiteTable(error)) throw new SiteOrdersUnavailableError();
        if (error.code === "23505") return { ok: false as const, conflict: true as const };
        throw fail("écriture", error);
      }
      return { ok: true as const, id: (data as { id: string }).id, linked, offersKept };
    },
    async recordRefusal(restaurantId, reason) {
      const { error } = await admin.from("site_order_refusals").insert({ restaurant_id: restaurantId, reason: reason.slice(0, 60) });
      if (error && !isMissingSiteTable(error)) console.error("[site-orders] refus non tracé :", error.message);
    },
    async countRefusals(restaurantId, sinceIso) {
      const { data, error } = await admin
        .from("site_order_refusals")
        .select("reason")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", sinceIso)
        // Les compteurs de visites (lib/site-orders/fiche.ts) ne sont pas des refus : ils ne doivent pas remplir le plafond.
        .not("reason", "like", `${VIEW_REASON_PREFIX}%`)
        .limit(5000); // un plafond : au-delà, le compte exact n'importe plus, l'alerte est déjà allumée
      if (error) {
        if (isMissingSiteTable(error)) throw new SiteOrdersUnavailableError();
        throw fail("refus", error);
      }
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as { reason: string }[]) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
      return counts;
    },
    async listOrders(restaurantId, sinceIso) {
      const cols = "id, number, first_name, phone, lines, total_cents, status, created_at, ready_at, picked_up_at, cancelled_at, cancel_reason";
      const read = (select: string) =>
        admin
          .from("site_orders")
          .select(select)
          .eq("restaurant_id", restaurantId)
          .or(`created_at.gte.${sinceIso},status.in.(recue,prete)`)
          .order("created_at", { ascending: false })
          .limit(200);
      let { data, error } = await read(`${cols}, offer_ids`);
      // Sans la colonne des offres (migration 20261127-1400), la liste se lit comme avant.
      if (error && isMissingColumn(error) && /offer_ids/.test(error.message ?? "")) ({ data, error } = await read(cols));
      if (error) {
        if (isMissingSiteTable(error)) throw new SiteOrdersUnavailableError();
        throw fail("liste", error);
      }
      return (data ?? []) as unknown as OrderRow[];
    },
    async transition(restaurantId, id, from: OrderStatus, patch) {
      const { data, error } = await admin.from("site_orders").update(patch).eq("id", id).eq("restaurant_id", restaurantId).eq("status", from).select("id");
      if (error) {
        if (isMissingSiteTable(error)) throw new SiteOrdersUnavailableError();
        throw fail("état", error);
      }
      return (data ?? []).length > 0;
    },
    async getStatus(restaurantId, id) {
      const { data, error } = await admin.from("site_orders").select("status").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle();
      if (error) {
        if (isMissingSiteTable(error)) throw new SiteOrdersUnavailableError();
        throw fail("lecture", error);
      }
      const s = (data as { status?: string } | null)?.status;
      return s === "recue" || s === "prete" || s === "retiree" || s === "annulee" ? s : null;
    },
  };
}
