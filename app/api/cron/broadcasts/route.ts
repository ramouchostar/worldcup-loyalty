import { NextResponse } from "next/server";
import { processDueScheduledBroadcasts, todayInBrussels } from "@/lib/broadcast";

// ADR 0023 — Cron quotidien des broadcasts programmés : envoie les annonces
// de promo arrivées à leur date (J-1/J-2 du jour de promo). Tourne en début
// de soirée — le moment où l'annonce « demain, promo » travaille le mieux.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const result = await processDueScheduledBroadcasts(todayInBrussels());
  return NextResponse.json({ ok: true, ...result });
}
