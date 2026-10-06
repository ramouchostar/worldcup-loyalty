import { NextResponse } from "next/server";
import { syncLocalEvents } from "@/lib/signals/local-events-sync";

// Signal « événements locaux » — copie de l'agenda de visit.brussels dans
// `local_events`. Une lecture = 16 appels et 144 Mo : le cron tourne tous les
// deux jours, pas chaque nuit (l'API est publique et sans filtre). Chaque
// passage écrit une ligne dans `signal_sync_runs`, réussi ou non.
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await syncLocalEvents();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
