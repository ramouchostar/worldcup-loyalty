import { createAdminClient } from "./supabase";
import { fetchAllRows } from "./paged-select";
import { addDays } from "./console-journey";
import { listDailyEntries } from "./daily-revenue";
import { outcomeHasAmount } from "./daily-revenue-model";
import { salesByDay } from "./growth-game";
import type { ProgramDay, RevenueDay } from "./revenue-tracker";

// Lecture du suivi du CA (ADR 0081 §7) — service-role, UN établissement.
//
// Deux sources de caisse : la saisie du CA du jour (`daily_revenue_entries`,
// ADR 0078 — elle seule sait qu'un jour était FERMÉ et combien de tickets la
// caisse a faits) et les ventes importées (`restaurant_sales`, CSV) pour les
// jours que la saisie ne couvre pas. Fail-open : une table absente ou une panne
// donne un suivi vide, jamais une page cassée — et le dit dans les logs.

/** 60 jours : 14 affichés + 4 mêmes jours de semaine pour comparer + marge. */
const HISTORY_DAYS = 60;

export async function loadRevenueTracker(restaurantId: string, today: string): Promise<{ days: RevenueDay[]; program: Record<string, ProgramDay> }> {
  const admin = createAdminClient();
  const since = addDays(today, -HISTORY_DAYS);

  const [entries, sales, orders] = await Promise.all([
    listDailyEntries(restaurantId).catch((e) => {
      console.error("[revenue-tracker] daily_revenue_entries :", (e as Error).message);
      return { missing: true as const };
    }),
    fetchAllRows<{ sold_on: string; amount: number }>((from, to) =>
      admin.from("restaurant_sales").select("sold_on, amount").eq("restaurant_id", restaurantId).gte("sold_on", since).range(from, to)
    ).catch((e) => {
      console.error("[revenue-tracker] restaurant_sales :", (e as Error).message);
      return { rows: [] as { sold_on: string; amount: number }[], truncated: true };
    }),
    fetchAllRows<{ order_date: string; amount: number | null }>((from, to) =>
      admin
        .from("orders")
        .select("order_date, amount")
        .eq("restaurant_id", restaurantId)
        .eq("status", "validated")
        .gte("order_date", since)
        .range(from, to)
    ).catch((e) => {
      console.error("[revenue-tracker] orders :", (e as Error).message);
      return { rows: [] as { order_date: string; amount: number | null }[], truncated: true };
    }),
  ]);

  const days = new Map<string, RevenueDay>();
  // 1. Les ventes importées, comme base.
  for (const [day, amount] of Object.entries(salesByDay(sales.rows))) {
    days.set(day, { day, amount, closed: false, tickets: null });
  }
  // 2. La saisie du jour l'emporte : elle seule connaît les jours fermés et les tickets.
  if (!entries.missing) {
    for (const e of entries.rows) {
      if (e.sales_day < since) continue;
      if (e.outcome === "ferme") days.set(e.sales_day, { day: e.sales_day, amount: null, closed: true, tickets: null });
      else if (outcomeHasAmount(e.outcome) && typeof e.amount === "number")
        days.set(e.sales_day, { day: e.sales_day, amount: e.amount, closed: false, tickets: e.tickets });
    }
  }

  const program: Record<string, ProgramDay> = {};
  for (const o of orders.rows) {
    const day = String(o.order_date).slice(0, 10);
    const p = (program[day] ??= { amount: 0, tickets: 0 });
    p.amount += Number(o.amount) || 0;
    p.tickets += 1;
  }

  return { days: [...days.values()], program };
}
