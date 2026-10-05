// ADR 0078 — CA du jour saisi à la main : lecture et écriture. SERVEUR
// UNIQUEMENT (service role) : la table est en RLS sans policy.
//
// Fail-open : tant que la migration 20261005-2041 n'est pas appliquée, les
// lectures renvoient `missing: true` et /platform/ca le dit, au lieu de planter.

import { createAdminClient } from "@/lib/supabase";
import { isMissingTable } from "@/lib/audit/store";
import type { DailyEntry, Outcome } from "@/lib/daily-revenue-model";

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
