// ADR 0099 §2 — la base des commandes du site (service role uniquement : prénom et téléphone d'un client, des euros).
// Une table absente (migration pas appliquée) se dit « pas encore activé », jamais une erreur obscure.

import { createAdminClient } from "../supabase";
import { loadOptionTrees } from "../menu-options/store";
import type { CatalogItem, OrderStatus } from "./order";
import { SiteOrdersUnavailableError, type NewOrderRow, type OrderRow, type OrdersDb } from "./service";

const isMissingSiteTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || (/site_order/.test(error.message ?? "") && /(does not exist|Could not find the table)/i.test(error.message ?? "")));

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "PGRST204" || error.code === "42703" || /column .*(does not exist|schema cache)|Could not find the '.*' column/i.test(error.message ?? ""));

export function supabaseOrdersDb(): OrdersDb {
  const admin = createAdminClient();
  const fail = (what: string, error: { message: string }) => new Error(`site_orders (${what}) : ${error.message}`);

  return {
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
      const { data, error } = await admin.from("site_orders").insert(row).select("id").single();
      if (error) {
        if (isMissingSiteTable(error)) throw new SiteOrdersUnavailableError();
        if (error.code === "23505") return { ok: false as const, conflict: true as const };
        throw fail("écriture", error);
      }
      return { ok: true as const, id: (data as { id: string }).id };
    },
    async recordRefusal(restaurantId, reason) {
      const { error } = await admin.from("site_order_refusals").insert({ restaurant_id: restaurantId, reason: reason.slice(0, 60) });
      if (error && !isMissingSiteTable(error)) console.error("[site-orders] refus non tracé :", error.message);
    },
    async listOrders(restaurantId, sinceIso) {
      const { data, error } = await admin
        .from("site_orders")
        .select("id, number, first_name, phone, lines, total_cents, status, created_at, ready_at, picked_up_at, cancelled_at, cancel_reason")
        .eq("restaurant_id", restaurantId)
        .or(`created_at.gte.${sinceIso},status.in.(recue,prete)`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        if (isMissingSiteTable(error)) throw new SiteOrdersUnavailableError();
        throw fail("liste", error);
      }
      return (data ?? []) as OrderRow[];
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
