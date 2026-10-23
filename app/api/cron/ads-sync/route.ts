import { NextResponse } from "next/server";
import { runAdsSync } from "@/lib/ads/sync";
import { runAdsGuards } from "@/lib/ads/guards";

// ADR 0085 §4 + ADR 0086 — la lecture Meta du matin, 4 h UTC (5 h ou 6 h à Bruxelles) :
// campagnes, statistiques des 7 derniers jours, avis de Meta, états des demandes, puis les
// garde-fous et leurs e-mails. Gardé par CRON_SECRET comme les autres crons. 503 si la
// lecture n'a même pas pu commencer (table absente) : rien n'est alors envoyé.

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const sync = await runAdsSync();
  if (!sync.runId) return NextResponse.json({ error: "Pub indisponible : migration non appliquée ?", sync }, { status: 503 });
  const guards = await runAdsGuards(sync);
  return NextResponse.json({ sync, guards });
}
