// ADR 0103 — connexion Belpeople et CA par jour. SERVEUR UNIQUEMENT (service
// role). Réutilise pos_connections, le coffre Vault et le journal de HubRise.
// Fail-open : sans la migration 20261114-1130, les lectures le disent.

import { createAdminClient } from "@/lib/supabase";
import { isMissingTable } from "@/lib/audit/store";
import { journal, markFailed, markOk, readToken } from "@/lib/hubrise/store";
import { BelpeopleAuthError, exploreProductTables, readDailySales, readHourlySales, signIn, type ExploredTable } from "./api";
import { revenueEntriesFrom, WINDOW_DAYS, windowStart, type DailySales } from "./model";

const PROVIDER = "belpeople";

export type BelpeopleConnection = {
  id: string;
  restaurant_id: string;
  store_ref: string; // location_id = store_id Belpeople (« 223 »)
  connected_at: string;
  last_ok_at: string | null;
  last_failed_at: string | null;
  last_failed_reason: string | null;
};

export async function belpeopleConnection(
  restaurantId: string,
): Promise<{ missing: true } | { missing: false; connection: BelpeopleConnection | null }> {
  const { data, error } = await createAdminClient()
    .from("pos_connections")
    .select("id, restaurant_id, location_id, connected_at, last_ok_at, last_failed_at, last_failed_reason")
    .eq("restaurant_id", restaurantId)
    .eq("provider", PROVIDER)
    .is("disconnected_at", null)
    .maybeSingle();
  if (isMissingTable(error)) return { missing: true };
  if (error) throw new Error(`pos_connections : ${error.message}`);
  if (!data) return { missing: false, connection: null };
  const r = data as Record<string, unknown>;
  return {
    missing: false,
    connection: {
      id: r.id as string,
      restaurant_id: r.restaurant_id as string,
      store_ref: r.location_id as string,
      connected_at: r.connected_at as string,
      last_ok_at: (r.last_ok_at as string) ?? null,
      last_failed_at: (r.last_failed_at as string) ?? null,
      last_failed_reason: (r.last_failed_reason as string) ?? null,
    },
  };
}

export async function listBelpeopleConnections(): Promise<BelpeopleConnection[]> {
  const found = await createAdminClient()
    .from("pos_connections")
    .select("id, restaurant_id, location_id, connected_at, last_ok_at, last_failed_at, last_failed_reason")
    .eq("provider", PROVIDER)
    .is("disconnected_at", null);
  if (isMissingTable(found.error)) return [];
  if (found.error) throw new Error(`pos_connections : ${found.error.message}`);
  return (found.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    restaurant_id: r.restaurant_id as string,
    store_ref: r.location_id as string,
    connected_at: r.connected_at as string,
    last_ok_at: (r.last_ok_at as string) ?? null,
    last_failed_at: (r.last_failed_at as string) ?? null,
    last_failed_reason: (r.last_failed_reason as string) ?? null,
  }));
}

/**
 * ADR 0103 amendé (2026-11-14) — l'établissement a une connexion Belpeople
 * active : son CA du jour vient de Belpeople, on ne lui demande plus de le
 * saisir (rappels, « À faire », idée de Chloé). Fail-open : une erreur de
 * lecture répond « non » (on redemande la saisie plutôt que de se taire) et le dit.
 */
export async function readsRevenueFromBelpeople(restaurantId: string): Promise<boolean> {
  try {
    const found = await belpeopleConnection(restaurantId);
    return !found.missing && found.connection !== null;
  } catch (e) {
    console.error("[belpeople] connexion illisible", restaurantId, (e as Error).message);
    return false;
  }
}

/**
 * Écrit les jours remplis chez Belpeople comme CA du jour (daily_revenue_entries,
 * source 'belpeople', outcome 'historique', tickets = commandes). Belpeople fait
 * foi : il remplace une saisie du même jour (le détail par canal est vidé, il ne
 * correspondrait plus au total). Migration 20261114-2000 requise.
 */
async function writeRevenueEntries(restaurantId: string, rows: DailySales[], today: string): Promise<{ written: number; replaced: number }> {
  const entries = revenueEntriesFrom(rows, today);
  if (entries.length === 0) return { written: 0, replaced: 0 };
  const db = createAdminClient();
  const { data: before } = await db
    .from("daily_revenue_entries")
    .select("sales_day, source")
    .eq("restaurant_id", restaurantId)
    .in("sales_day", entries.map((e) => e.sales_day));
  const replaced = ((before ?? []) as { source: string | null }[]).filter((b) => b.source !== "belpeople").length;
  const now = new Date().toISOString();
  const { error } = await db.from("daily_revenue_entries").upsert(
    entries.map((e) => ({
      restaurant_id: restaurantId,
      sales_day: e.sales_day,
      outcome: "historique",
      amount: e.amount,
      tickets: e.tickets,
      asked_at: null,
      replied_at: null,
      note: null,
      source: "belpeople",
      carte: null,
      cash: null,
      internet: null,
      uber: null,
      deliveroo: null,
      takeaway: null,
      emporter: null,
      sur_place: null,
      updated_at: now,
    })),
    { onConflict: "restaurant_id,sales_day" },
  );
  if (error) throw new Error(`CA du jour (daily_revenue_entries) : ${error.message}`);
  // Comme save_daily_revenue_console : chaque jour avec montant est aussi une
  // vente caisse (restaurant_sales, sans heure), lue par la prévision.
  const daysList = entries.map((e) => e.sales_day);
  const del = await db.from("restaurant_sales").delete().eq("restaurant_id", restaurantId).in("sold_on", daysList);
  if (del.error) throw new Error(`restaurant_sales : ${del.error.message}`);
  const ins = await db
    .from("restaurant_sales")
    .insert(entries.map((e) => ({ restaurant_id: restaurantId, sold_on: e.sales_day, sold_at: null, amount: e.amount, source_import_id: null })));
  if (ins.error) throw new Error(`restaurant_sales : ${ins.error.message}`);
  return { written: entries.length, replaced };
}

/** Enregistre (ou remplace) l'accès Belpeople : e-mail + mot de passe dans Vault. */
export async function saveBelpeopleCredentials(input: {
  restaurantId: string;
  userId: string;
  storeRef: string;
  email: string;
  password: string;
}): Promise<void> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data: old } = await db
    .from("pos_connections")
    .select("id")
    .eq("restaurant_id", input.restaurantId)
    .eq("provider", PROVIDER)
    .is("disconnected_at", null);
  for (const o of (old ?? []) as { id: string }[]) {
    await db.rpc("pos_forget_token", { p_connection_id: o.id });
    await db.from("pos_connections").update({ disconnected_at: now }).eq("id", o.id);
  }
  const { data, error } = await db
    .from("pos_connections")
    .insert({
      restaurant_id: input.restaurantId,
      provider: PROVIDER,
      location_id: input.storeRef,
      connected_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`pos_connections : ${error?.message ?? "insertion vide"}`);
  const id = (data as { id: string }).id;
  const secret = JSON.stringify({ email: input.email, password: input.password });
  const { error: vaultError } = await db.rpc("pos_store_token", { p_connection_id: id, p_token: secret });
  if (vaultError) throw new Error(`Coffre (Vault) : ${vaultError.message}`);
  await journal("belpeople_connected", { store_ref: input.storeRef }, id);
}

export async function disconnectBelpeople(connectionId: string): Promise<void> {
  const db = createAdminClient();
  await db.rpc("pos_forget_token", { p_connection_id: connectionId });
  await db.from("pos_connections").update({ disconnected_at: new Date().toISOString() }).eq("id", connectionId);
  await journal("belpeople_disconnected", {}, connectionId);
}

/** Lit la fenêtre glissante chez Belpeople et met à jour pos_daily_sales. */
export async function syncBelpeople(conn: BelpeopleConnection, today: string, days = WINDOW_DAYS): Promise<{ days: number; written: number; replaced: number }> {
  const raw = await readToken(conn.id);
  if (!raw) {
    await markFailed(conn.id, "Accès absent du coffre : ressaisir le mot de passe Belpeople.");
    throw new Error("Accès Belpeople absent du coffre.");
  }
  let creds: { email: string; password: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    await markFailed(conn.id, "Accès Belpeople illisible dans le coffre.");
    throw new Error("Accès Belpeople illisible.");
  }
  let rows: DailySales[];
  try {
    const token = await signIn(creds.email, creds.password);
    rows = await readDailySales(token, conn.store_ref, windowStart(today, days));
  } catch (e) {
    const reason = e instanceof BelpeopleAuthError ? `Connexion Belpeople refusée : ${e.message}` : (e as Error).message;
    await markFailed(conn.id, reason);
    await journal("belpeople_failed", { reason }, conn.id);
    throw e;
  }
  if (rows.length > 0) {
    const now = new Date().toISOString();
    const { error } = await createAdminClient()
      .from("pos_daily_sales")
      .upsert(
        rows.map((d) => ({
          provider: PROVIDER,
          restaurant_id: conn.restaurant_id,
          store_ref: conn.store_ref,
          sales_day: d.sales_day,
          gross_inc_vat: d.gross_inc_vat,
          gross_exc_vat: d.gross_exc_vat,
          orders_count: d.orders_count,
          read_at: now,
        })),
        { onConflict: "provider,restaurant_id,sales_day" },
      );
    if (error) throw new Error(`pos_daily_sales : ${error.message}`);
  }
  // Le CA du jour de la console vient désormais de Belpeople. Un refus (migration
  // 20261114-2000 absente, contrainte) est dit sur /platform/ca, jamais tu.
  let revenue = { written: 0, replaced: 0 };
  try {
    revenue = await writeRevenueEntries(conn.restaurant_id, rows, today);
  } catch (e) {
    const reason = (e as Error).message;
    await markFailed(conn.id, reason);
    await journal("belpeople_failed", { reason }, conn.id);
    throw e;
  }
  // Ventes par heure (heures pleines/creuses) : même fenêtre, même jeton. Un
  // échec horaire ne fait pas échouer le CA par jour, déjà enregistré.
  let hours = 0;
  try {
    const token2 = await signIn(creds.email, creds.password);
    const hourly = await readHourlySales(token2, conn.store_ref, windowStart(today, days));
    if (hourly.length > 0) {
      const now = new Date().toISOString();
      const { error } = await createAdminClient()
        .from("pos_hourly_sales")
        .upsert(
          hourly.map((h) => ({
            provider: PROVIDER,
            restaurant_id: conn.restaurant_id,
            store_ref: conn.store_ref,
            hour_start: h.hour_start,
            gross_inc_vat: h.gross_inc_vat,
            orders_count: h.orders_count,
            read_at: now,
          })),
          { onConflict: "provider,restaurant_id,hour_start" },
        );
      if (!error) hours = hourly.length;
      else console.error("[belpeople] pos_hourly_sales", error.message);
    }
  } catch (e) {
    console.error("[belpeople] lecture horaire", (e as Error).message);
  }
  await markOk(conn.id);
  await journal("belpeople_sync", { days: rows.length, hours, from: windowStart(today, days), ...revenue }, conn.id);
  return { days: rows.length, ...revenue };
}

export async function listBelpeopleSales(restaurantId: string, fromDay: string): Promise<DailySales[]> {
  const { data, error } = await createAdminClient()
    .from("pos_daily_sales")
    .select("sales_day, gross_inc_vat, gross_exc_vat, orders_count")
    .eq("provider", PROVIDER)
    .eq("restaurant_id", restaurantId)
    .gte("sales_day", fromDay)
    .order("sales_day", { ascending: false });
  if (isMissingTable(error)) return [];
  if (error) throw new Error(`pos_daily_sales : ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    sales_day: r.sales_day as string,
    gross_inc_vat: r.gross_inc_vat === null ? null : Number(r.gross_inc_vat),
    gross_exc_vat: r.gross_exc_vat === null ? null : Number(r.gross_exc_vat),
    orders_count: r.orders_count === null ? null : Number(r.orders_count),
  }));
}

import type { HourlyRow } from "./hourly";

/** Les lignes horaires des `days` derniers jours (profil heures pleines/creuses). */
export async function listBelpeopleHourly(restaurantId: string, fromIso: string): Promise<HourlyRow[]> {
  const { data, error } = await createAdminClient()
    .from("pos_hourly_sales")
    .select("hour_start, gross_inc_vat, orders_count")
    .eq("provider", PROVIDER)
    .eq("restaurant_id", restaurantId)
    .gte("hour_start", fromIso)
    .order("hour_start", { ascending: false })
    .limit(5000);
  if (isMissingTable(error)) return [];
  if (error) throw new Error(`pos_hourly_sales : ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    hour_start: r.hour_start as string,
    gross_inc_vat: r.gross_inc_vat === null ? null : Number(r.gross_inc_vat),
    orders_count: r.orders_count === null ? null : Number(r.orders_count),
  }));
}


/** ADR 0103 §6 — exploration des ventes par produit, à la demande d'un super-admin. Journalisée. */
export async function exploreBelpeopleProducts(conn: BelpeopleConnection): Promise<ExploredTable[]> {
  const raw = await readToken(conn.id);
  if (!raw) throw new Error("Accès Belpeople absent du coffre : ressaisir le mot de passe.");
  const creds = JSON.parse(raw) as { email: string; password: string };
  const token = await signIn(creds.email, creds.password);
  const tables = await exploreProductTables(token, conn.store_ref);
  await journal("belpeople_explore", { tables: tables.map((t) => t.name) }, conn.id);
  return tables;
}
