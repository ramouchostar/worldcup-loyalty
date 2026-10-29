// ADR 0078 — CA du jour saisi à la main : lecture et écriture. SERVEUR
// UNIQUEMENT (service role) : la table est en RLS sans policy.
//
// Fail-open : tant que la migration 20261005-2041 n'est pas appliquée, les
// lectures renvoient `missing: true` et /platform/ca le dit, au lieu de planter.

import { createAdminClient } from "@/lib/supabase";
import { isMissingTable } from "@/lib/audit/store";
import type { DailyEntry, Outcome } from "@/lib/daily-revenue-model";
import { CHANNELS, channelsNote, type Channels, type LegacySplit } from "@/lib/daily-revenue-entry";

export type EntriesListing = { missing: true } | { missing: false; rows: DailyEntry[] };

export async function listDailyEntries(restaurantId: string): Promise<EntriesListing> {
  const { data, error } = await createAdminClient()
    .from("daily_revenue_entries")
    .select("sales_day, outcome, amount, tickets, asked_at, replied_at, note")
    .eq("restaurant_id", restaurantId)
    .order("sales_day", { ascending: false })
    .limit(400);
  if (isMissingTable(error)) return { missing: true };
  if (error) throw new Error(`daily_revenue_entries : ${error.message}`);
  return {
    missing: false,
    rows: (data ?? []).map((r) => ({
      sales_day: r.sales_day as string,
      outcome: r.outcome as Outcome,
      amount: r.amount === null ? null : Number(r.amount),
      tickets: r.tickets as number | null,
      // Postgres renvoie « 10:00:00 » : on garde HH:MM, comme la saisie.
      asked_at: r.asked_at ? String(r.asked_at).slice(0, 5) : null,
      replied_at: r.replied_at ? String(r.replied_at).slice(0, 5) : null,
      note: r.note as string | null,
    })),
  };
}

export async function saveDailyEntry(restaurantId: string, entry: DailyEntry, userId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("save_daily_revenue", {
    p_restaurant_id: restaurantId,
    p_day: entry.sales_day,
    p_outcome: entry.outcome,
    p_amount: entry.amount,
    p_tickets: entry.tickets,
    p_asked_at: entry.asked_at,
    p_replied_at: entry.replied_at,
    p_note: entry.note,
    p_entered_by: userId,
  });
  if (error) throw new Error(`save_daily_revenue : ${error.message}`);
}

export async function deleteDailyEntry(restaurantId: string, day: string): Promise<void> {
  const { error } = await createAdminClient().rpc("delete_daily_revenue", {
    p_restaurant_id: restaurantId,
    p_day: day,
  });
  if (error) throw new Error(`delete_daily_revenue : ${error.message}`);
}

// ── ADR 0087 — la saisie du restaurateur dans la console ─────────────────────


export type ConsoleEntry = { closed: true } | { closed: false; amount: number; tickets: number | null; channels: Channels | null };

/** Fonction ou colonne absente : la migration 20261029-1200 (ou 20261024-1530) n'est pas encore passée. */
function isMissingMigration(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || error.code === "42703" || /could not find the function|does not exist/i.test(error.message ?? "");
}

/**
 * Écrit le jour ET sa vente de caisse (save_daily_revenue_console). Repli
 * fail-open sans la migration : save_daily_revenue avec l'issue « de lui-même »
 * (envoyé sans qu'on le demande, le plus proche de « saisi »), le détail des
 * canaux recopié dans la note. `fallback` le dit à l'appelant, qui le journalise.
 */
export async function saveConsoleEntry(restaurantId: string, day: string, entry: ConsoleEntry, userId: string): Promise<{ fallback: boolean }> {
  const admin = createAdminClient();
  const ch = !entry.closed ? entry.channels : null;
  const { error } = await admin.rpc("save_daily_revenue_console", {
    p_restaurant_id: restaurantId,
    p_day: day,
    p_closed: entry.closed,
    p_amount: entry.closed ? null : entry.amount,
    p_tickets: entry.closed ? null : entry.tickets,
    p_carte: ch?.carte ?? null,
    p_cash: ch?.cash ?? null,
    p_internet: ch?.internet ?? null,
    p_uber: ch?.uber ?? null,
    p_deliveroo: ch?.deliveroo ?? null,
    p_takeaway: ch?.takeaway ?? null,
    p_entered_by: userId,
  });
  if (!error) return { fallback: false };
  if (!isMissingMigration(error)) throw new Error(`save_daily_revenue_console : ${error.message}`);

  console.error("[daily-revenue] migration 20261029-1200 absente : repli sur save_daily_revenue");
  const now = new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Brussels" });
  await saveDailyEntry(
    restaurantId,
    {
      sales_day: day,
      outcome: entry.closed ? "ferme" : "spontane",
      amount: entry.closed ? null : entry.amount,
      tickets: entry.closed ? null : entry.tickets,
      asked_at: null,
      replied_at: entry.closed ? null : now,
      note: ["Saisi dans la console", channelsNote(ch)].filter(Boolean).join(" — "),
    },
    userId,
  );
  return { fallback: true };
}

/**
 * Le détail d'un jour, pour pré-remplir : les deux blocs, et l'ancien découpage sur
 * place / à emporter s'il a été noté avant le 2026-10-29 (rappelé, jamais repris tel
 * quel). Fail-open : rien sans les colonnes.
 */
export async function getDayChannels(restaurantId: string, day: string): Promise<{ channels: Channels | null; legacy: LegacySplit | null }> {
  const { data, error } = await createAdminClient()
    .from("daily_revenue_entries")
    .select([...CHANNELS.map((c) => c.key), "emporter", "sur_place"].join(", "))
    .eq("restaurant_id", restaurantId)
    .eq("sales_day", day)
    .maybeSingle();
  if (error || !data) return { channels: null, legacy: null };
  const row = data as unknown as Record<string, number | string | null>;
  const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
  const out = {} as Channels;
  let any = false;
  for (const c of CHANNELS) {
    out[c.key] = num(row[c.key]);
    if (out[c.key] !== null) any = true;
  }
  const legacy = { surPlace: num(row.sur_place), emporter: num(row.emporter) };
  return { channels: any ? out : null, legacy: legacy.surPlace !== null || legacy.emporter !== null ? legacy : null };
}
