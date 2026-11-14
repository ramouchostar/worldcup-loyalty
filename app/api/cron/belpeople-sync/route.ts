import { NextResponse } from "next/server";
import { listBelpeopleConnections, syncBelpeople } from "@/lib/belpeople/store";
import { todayInBrussels } from "@/lib/qr-funnel";

// ADR 0103 §3 — lecture de nuit de Belpeople (vercel.json, 5 h UTC). Relit la
// fenêtre glissante des 10 derniers jours pour chaque connexion active : un jour
// qui se remplit en différé est rattrapé. Un échec est tracé, jamais tu.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const today = todayInBrussels();
  const results: Record<string, unknown>[] = [];
  for (const conn of await listBelpeopleConnections()) {
    try {
      results.push({ restaurant: conn.restaurant_id, ...(await syncBelpeople(conn, today)) });
    } catch (e) {
      console.error("[cron/belpeople-sync]", conn.restaurant_id, (e as Error).message);
      results.push({ restaurant: conn.restaurant_id, error: (e as Error).message });
    }
  }
  return NextResponse.json({ today, results });
}
