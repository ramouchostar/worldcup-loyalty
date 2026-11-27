import { NextResponse } from "next/server";
import { runAuto } from "@/lib/restaurant-posts/auto/engine";
import { autoDeps } from "@/lib/restaurant-posts/auto/server";
import { PostsUnavailableError } from "@/lib/restaurant-posts/service";

// ADR 0112 — les articles publiés automatiquement. Appelé toutes les heures : n'agit qu'à 17 h (préparer et prévenir
// pour demain) et à 10 h (revérifier et publier), heure de Bruxelles, été comme hiver. Rejouable : rien n'est envoyé
// ni publié deux fois. Le résultat dit ce qui a été fait, les sources indisponibles et les erreurs.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    const report = await runAuto(autoDeps(new Date()));
    if (report.acted) console.log("[articles auto]", JSON.stringify(report));
    return NextResponse.json({ ok: report.errors.length === 0, ...report }, { status: report.errors.length === 0 ? 200 : 503 });
  } catch (e) {
    const missing = e instanceof PostsUnavailableError;
    console.error("[articles auto] passage impossible :", missing ? "migrations des articles pas appliquées" : e);
    return NextResponse.json({ ok: false, error: missing ? "Migrations des articles pas appliquées." : "Erreur serveur." }, { status: 503 });
  }
}
