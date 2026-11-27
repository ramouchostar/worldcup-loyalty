import { NextResponse } from "next/server";
import { prefetchWeather } from "@/lib/restaurant-posts/auto/engine";
import { autoDeps } from "@/lib/restaurant-posts/auto/server";
import { PostsUnavailableError } from "@/lib/restaurant-posts/service";

// ADR 0112 §9 — la réserve des prévisions météo. Appelée toutes les heures À LA MINUTE 23 (jamais à l'heure pile, avec
// en plus un décalage au hasard) : n'agit qu'à 9 h et 16 h à Bruxelles, une heure avant la publication et le préavis,
// qui ne lisent ensuite que cette réserve. Éteinte tant que MET_NORWAY_USER_AGENT est vide : le résultat le dit.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Le décalage de départ, au hasard, puis une courte pause entre deux demandes. */
const START_SPREAD_MS = 90_000;
const BETWEEN_MS = 500;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    let first = true;
    const report = await prefetchWeather(autoDeps(new Date()), async () => {
      await wait(Math.random() * (first ? START_SPREAD_MS : BETWEEN_MS));
      first = false;
    });
    if (report.acted) console.log("[articles auto] réserve météo", JSON.stringify(report));
    // Éteinte n'est pas une panne ; une demande qui échoue, si.
    return NextResponse.json({ ok: report.errors.length === 0, ...report }, { status: report.errors.length === 0 ? 200 : 503 });
  } catch (e) {
    const missing = e instanceof PostsUnavailableError;
    console.error("[articles auto] réserve météo impossible :", missing ? "migrations des articles pas appliquées" : e);
    return NextResponse.json({ ok: false, error: missing ? "Migrations des articles pas appliquées." : "Erreur serveur." }, { status: 503 });
  }
}
