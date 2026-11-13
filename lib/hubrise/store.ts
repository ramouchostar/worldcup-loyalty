// ADR 0102 — connexions HubRise, commandes lues, référence et journal.
// SERVEUR UNIQUEMENT (service role : tables en RLS sans policy).
//
// Fail-open : tant que la migration 20261113-2345 n'est pas appliquée, les
// lectures renvoient `missing: true` et /platform/ca le dit, sans planter.

import { createAdminClient } from "@/lib/supabase";
import { isMissingTable } from "@/lib/audit/store";
import { HubriseUnauthorized, listOrders } from "./api";
import { apiWindowFor, toStoredOrder, type OrderRow, type StoredOrder } from "./model";

export type PosConnection = {
  id: string;
  restaurant_id: string;
  account_id: string | null;
  account_name: string | null;
  location_id: string;
  location_name: string | null;
  callback_url: string | null;
  connected_at: string;
  last_ok_at: string | null;
  last_failed_at: string | null;
  last_failed_reason: string | null;
};

const CONNECTION_COLS =
  "id, restaurant_id, account_id, account_name, location_id, location_name, callback_url, connected_at, last_ok_at, last_failed_at, last_failed_reason";

export async function activeConnection(restaurantId: string): Promise<{ missing: true } | { missing: false; connection: PosConnection | null }> {
  const { data, error } = await createAdminClient()
    .from("pos_connections")
    .select(CONNECTION_COLS)
    .eq("restaurant_id", restaurantId)
    .eq("provider", "hubrise")
    .is("disconnected_at", null)
    .maybeSingle();
  if (isMissingTable(error)) return { missing: true };
  if (error) throw new Error(`pos_connections : ${error.message}`);
  return { missing: false, connection: (data as PosConnection | null) ?? null };
}

export async function connectionByLocation(locationId: string): Promise<PosConnection | null> {
  const { data, error } = await createAdminClient()
    .from("pos_connections")
    .select(CONNECTION_COLS)
    .eq("provider", "hubrise")
    .eq("location_id", locationId)
    .is("disconnected_at", null)
    .maybeSingle();
  if (error) throw new Error(`pos_connections : ${error.message}`);
  return (data as PosConnection | null) ?? null;
}

export async function listActiveConnections(): Promise<PosConnection[]> {
  const { data, error } = await createAdminClient()
    .from("pos_connections")
    .select(CONNECTION_COLS)
    .eq("provider", "hubrise")
    .is("disconnected_at", null);
  if (isMissingTable(error)) return [];
  if (error) throw new Error(`pos_connections : ${error.message}`);
  return (data ?? []) as PosConnection[];
}

/** Ferme la connexion active de l'établissement (s'il y en a une) et en ouvre une nouvelle. */
export async function openConnection(input: {
  restaurantId: string;
  userId: string;
  accountId: string | null;
  accountName: string | null;
  locationId: string;
  locationName: string | null;
  token: string;
}): Promise<string> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  // Une reconnexion au même point de vente, ou un changement de point de vente :
  // l'ancienne ligne est fermée, son jeton retiré du coffre.
  const { data: old } = await db
    .from("pos_connections")
    .select("id")
    .eq("provider", "hubrise")
    .is("disconnected_at", null)
    .or(`restaurant_id.eq.${input.restaurantId},location_id.eq.${input.locationId}`);
  for (const o of (old ?? []) as { id: string }[]) {
    await db.rpc("pos_forget_token", { p_connection_id: o.id });
    await db.from("pos_connections").update({ disconnected_at: now }).eq("id", o.id);
  }
  const { data, error } = await db
    .from("pos_connections")
    .insert({
      restaurant_id: input.restaurantId,
      provider: "hubrise",
      account_id: input.accountId,
      account_name: input.accountName,
      location_id: input.locationId,
      location_name: input.locationName,
      connected_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`pos_connections : ${error?.message ?? "insertion vide"}`);
  const id = (data as { id: string }).id;
  const { error: vaultError } = await db.rpc("pos_store_token", { p_connection_id: id, p_token: input.token });
  if (vaultError) throw new Error(`Coffre (Vault) : ${vaultError.message}`);
  return id;
}

export async function readToken(connectionId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc("pos_read_token", { p_connection_id: connectionId });
  if (error) throw new Error(`Coffre (Vault) : ${error.message}`);
  return (data as string | null) ?? null;
}

export async function closeConnection(connectionId: string): Promise<void> {
  const db = createAdminClient();
  await db.rpc("pos_forget_token", { p_connection_id: connectionId });
  await db.from("pos_connections").update({ disconnected_at: new Date().toISOString() }).eq("id", connectionId);
}

export async function setCallbackUrl(connectionId: string, url: string): Promise<void> {
  await createAdminClient().from("pos_connections").update({ callback_url: url }).eq("id", connectionId);
}

export async function markOk(connectionId: string): Promise<void> {
  await createAdminClient()
    .from("pos_connections")
    .update({ last_ok_at: new Date().toISOString(), last_failed_at: null, last_failed_reason: null })
    .eq("id", connectionId);
}

export async function markFailed(connectionId: string, reason: string): Promise<void> {
  await createAdminClient()
    .from("pos_connections")
    .update({ last_failed_at: new Date().toISOString(), last_failed_reason: reason.slice(0, 300) })
    .eq("id", connectionId);
}

/** La trace (ADR 0102, Conséquences). Best-effort : ne fait jamais échouer l'appelant. */
export async function journal(kind: string, detail: Record<string, unknown>, connectionId: string | null = null): Promise<void> {
  try {
    await createAdminClient().from("pos_journal").insert({ kind, detail, connection_id: connectionId });
  } catch (e) {
    console.warn("[hubrise] journal", kind, (e as Error).message);
  }
}

/**
 * Enregistre des commandes. Idempotent : la dernière version gagne, mais
 * `first_received_via` garde le premier canal d'arrivée (rappel ou relecture),
 * pour mesurer les rappels perdus. Renvoie le nombre de commandes nouvelles.
 */
export async function upsertOrders(conn: PosConnection, orders: StoredOrder[], via: "callback" | "sync"): Promise<number> {
  if (orders.length === 0) return 0;
  const db = createAdminClient();
  const ids = orders.map((o) => o.external_id);
  const { data: existing, error: readError } = await db
    .from("pos_orders")
    .select("external_id, first_received_via")
    .eq("provider", "hubrise")
    .in("external_id", ids);
  if (readError) throw new Error(`pos_orders : ${readError.message}`);
  const known = new Map(((existing ?? []) as { external_id: string; first_received_via: "callback" | "sync" }[]).map((e) => [e.external_id, e.first_received_via]));
  const now = new Date().toISOString();
  const rows = orders.map((o) => ({
    provider: "hubrise",
    restaurant_id: conn.restaurant_id,
    ...o,
    first_received_via: known.get(o.external_id) ?? via,
    updated_at: now,
  }));
  const { error } = await db.from("pos_orders").upsert(rows, { onConflict: "provider,external_id" });
  if (error) throw new Error(`pos_orders : ${error.message}`);
  return orders.filter((o) => !known.has(o.external_id)).length;
}

/** Relit un jour de vente par l'API et rattrape les rappels perdus. */
export async function syncDay(conn: PosConnection, day: string): Promise<{ seen: number; missedByCallback: number }> {
  const token = await readToken(conn.id);
  if (!token) {
    await markFailed(conn.id, "Jeton absent du coffre : reconnecter HubRise.");
    throw new Error("Jeton absent du coffre.");
  }
  const { after, before } = apiWindowFor(day);
  let raw;
  try {
    raw = await listOrders(token, after, before);
  } catch (e) {
    if (e instanceof HubriseUnauthorized) {
      await markFailed(conn.id, e.message);
      await journal("token_refused", { day, message: e.message }, conn.id);
    }
    throw e;
  }
  const stored = raw.map(toStoredOrder).filter((o): o is StoredOrder => o !== null);
  const missedByCallback = await upsertOrders(conn, stored, "sync");
  const seen = stored.filter((o) => o.sales_day === day).length;
  await markOk(conn.id);
  await journal("sync", { day, seen, missed_by_callback: missedByCallback }, conn.id);
  return { seen, missedByCallback };
}

export async function listOrderRows(restaurantId: string, fromDay: string): Promise<OrderRow[]> {
  const { data, error } = await createAdminClient()
    .from("pos_orders")
    .select("sales_day, channel, status, total, first_received_via")
    .eq("restaurant_id", restaurantId)
    .gte("sales_day", fromDay)
    .limit(5000);
  if (isMissingTable(error)) return [];
  if (error) throw new Error(`pos_orders : ${error.message}`);
  return ((data ?? []) as OrderRow[]).map((r) => ({ ...r, total: r.total === null ? null : Number(r.total) }));
}

export type ReferenceDay = { sales_day: string; channel: string; amount: number; source: string | null };

/**
 * La référence d'un canal, jour par jour : relevé noté sur /platform/ca
 * (pos_reference_days) en priorité, sinon la ligne du CA du jour saisi par
 * le restaurateur (daily_revenue_entries.uber, ADR 0087).
 */
export async function listReferences(restaurantId: string, fromDay: string): Promise<ReferenceDay[]> {
  const db = createAdminClient();
  const [noted, entries] = await Promise.all([
    db.from("pos_reference_days").select("sales_day, channel, amount, source").eq("restaurant_id", restaurantId).gte("sales_day", fromDay),
    db.from("daily_revenue_entries").select("sales_day, uber, deliveroo, takeaway").eq("restaurant_id", restaurantId).gte("sales_day", fromDay),
  ]);
  const out = new Map<string, ReferenceDay>();
  for (const e of ((entries.data ?? []) as Record<string, unknown>[])) {
    for (const ch of ["uber", "deliveroo", "takeaway"] as const) {
      const v = e[ch];
      if (v !== null && v !== undefined) out.set(`${e.sales_day}|${ch}`, { sales_day: String(e.sales_day), channel: ch, amount: Number(v), source: "saisie" });
    }
  }
  if (!isMissingTable(noted.error)) {
    for (const r of ((noted.data ?? []) as ReferenceDay[])) {
      out.set(`${r.sales_day}|${r.channel}`, { ...r, amount: Number(r.amount) });
    }
  }
  return [...out.values()];
}

export async function saveReference(input: { restaurantId: string; day: string; channel: string; amount: number; source: string; userId: string }): Promise<void> {
  const { error } = await createAdminClient().from("pos_reference_days").upsert(
    {
      restaurant_id: input.restaurantId,
      sales_day: input.day,
      channel: input.channel,
      amount: input.amount,
      source: input.source,
      noted_by: input.userId,
      noted_at: new Date().toISOString(),
    },
    { onConflict: "restaurant_id,sales_day,channel" },
  );
  if (error) throw new Error(`pos_reference_days : ${error.message}`);
}

export async function recentJournal(connectionId: string, limit = 8): Promise<{ at: string; kind: string; detail: Record<string, unknown> }[]> {
  const { data, error } = await createAdminClient()
    .from("pos_journal")
    .select("at, kind, detail")
    .eq("connection_id", connectionId)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as { at: string; kind: string; detail: Record<string, unknown> }[];
}

/** Rappels refusés (signature fausse ou point de vente inconnu) depuis `sinceIso`, tous établissements. */
export async function refusedCallbacksSince(sinceIso: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("pos_journal")
    .select("id", { count: "exact", head: true })
    .in("kind", ["callback_refused", "callback_unknown_location"])
    .gte("at", sinceIso);
  if (error) return 0;
  return count ?? 0;
}
