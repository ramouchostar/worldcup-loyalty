import { NextResponse } from "next/server";
import { listActiveConnections, syncDay } from "@/lib/hubrise/store";
import { todayInBrussels } from "@/lib/qr-funnel";
import { addDays } from "@/lib/daily-revenue-model";

// ADR 0102 §2 — relecture de nuit (vercel.json, 4 h 30 UTC = 5 h 30 ou 6 h 30
// à Bruxelles, après la bascule de 5 h) : relit le jour de vente d'hier pour
// chaque connexion HubRise active. Une commande que le rappel n'avait pas
// apportée est comptée (missed_by_callback, pos_journal).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const day = addDays(todayInBrussels(), -1);
  const results: Record<string, unknown>[] = [];
  for (const conn of await listActiveConnections()) {
    try {
      results.push({ restaurant: conn.restaurant_id, day, ...(await syncDay(conn, day)) });
    } catch (e) {
      console.error("[cron/hubrise-sync]", conn.restaurant_id, (e as Error).message);
      results.push({ restaurant: conn.restaurant_id, day, error: (e as Error).message });
    }
  }
  return NextResponse.json({ day, results });
}
