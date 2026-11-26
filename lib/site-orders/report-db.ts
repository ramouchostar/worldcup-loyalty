// ADR 0108 §6 — les lectures du rapport de la semaine (service role : des euros et des comptes). Lecture seule.
// Lu PAR PAGES et refusé s'il est tronqué (`fetchAllRowsStrict`) : un rapport construit sur un échantillon serait faux sans
// que rien ne le dise. La liste de la console (`listOrders`, 200 lignes) ne convient donc pas ici.

import { createAdminClient } from "../supabase";
import { fetchAllRowsStrict } from "../paged-select";
import { isMissingColumn, isMissingSiteTable } from "./db";
import { isOrderStatus, readLines } from "./order";
import { REPORT_REASONS, buildWeeklyReport, reportWindow, type ReportMembership, type ReportOrder, type WeeklyReport } from "./report";
import { SiteOrdersUnavailableError } from "./service";

type Row = { id: string; status: string; created_at: string; ready_at: string | null; total_cents: number; lines: unknown; member_id?: string | null };

const COLUMNS = "id, status, created_at, ready_at, total_cents, lines";

export async function loadWeeklyReport(restaurantId: string, now: Date = new Date()): Promise<WeeklyReport> {
  const admin = createAdminClient();
  const { sinceIso } = reportWindow(now);

  const readOrders = (columns: string) =>
    fetchAllRowsStrict<Row>("rapport, commandes", async (from, to) => {
      const { data, error } = await admin.from("site_orders").select(columns).eq("restaurant_id", restaurantId).gte("created_at", sinceIso).order("created_at").order("id").range(from, to);
      return { data: data as unknown as Row[] | null, error };
    });

  try {
    let linked = true;
    let rows: Row[];
    try {
      rows = await readOrders(`${COLUMNS}, member_id`);
    } catch (e) {
      // Migration 20261120-2000 absente : le rapport sort quand même, sans les nouveaux membres (fail-open), et le journal le dit.
      const error = { message: e instanceof Error ? e.message : String(e) };
      if (!isMissingColumn(error) || !/member_id/.test(error.message)) throw e;
      console.warn("[site-orders] colonne member_id absente (migration 20261120-2000 à appliquer) : rapport sans les nouveaux membres.");
      linked = false;
      rows = await readOrders(COLUMNS);
    }

    const [refusals, memberships] = await Promise.all([
      fetchAllRowsStrict<{ reason: string; created_at: string }>("rapport, refus", (from, to) =>
        admin.from("site_order_refusals").select("reason, created_at").eq("restaurant_id", restaurantId).gte("created_at", sinceIso).in("reason", [...REPORT_REASONS]).order("created_at").order("id").range(from, to)),
      linked
        ? fetchAllRowsStrict<{ user_id: string; joined_at: string }>("rapport, adhésions", (from, to) =>
            admin.from("memberships").select("user_id, joined_at").eq("restaurant_id", restaurantId).gte("joined_at", sinceIso).order("joined_at").order("user_id").range(from, to))
        : Promise.resolve(null),
    ]);

    const orders: ReportOrder[] = rows.map((r) => ({
      id: r.id, status: isOrderStatus(r.status) ? r.status : "recue", createdAt: r.created_at, readyAt: r.ready_at, totalCents: r.total_cents,
      lines: readLines(r.lines), memberId: r.member_id ?? null,
    }));
    const joined: ReportMembership[] | null = memberships === null ? null : memberships.map((m) => ({ userId: m.user_id, joinedAt: m.joined_at }));
    return buildWeeklyReport({ orders, refusals: refusals.map((r) => ({ reason: r.reason, createdAt: r.created_at })), memberships: joined, now });
  } catch (e) {
    // `fetchAllRowsStrict` ne garde que le message : la table absente se reconnaît à lui.
    if (e instanceof Error && isMissingSiteTable({ message: e.message })) throw new SiteOrdersUnavailableError();
    throw e;
  }
}
