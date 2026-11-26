import { NextResponse, type NextRequest } from "next/server";
import { checkIpRateLimit, hashIp } from "@/lib/rate-limit";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { supabaseOrdersDb } from "@/lib/site-orders/db";
import { APP_ENTRY_REASON, ficheView, viewReason } from "@/lib/site-orders/fiche";
import { readFiche } from "@/lib/site-orders/fiche-db";

// ADR 0108 §4 — ce que la fiche Google dit à l'accueil de l'espace : ouvert ou fermé (avec l'heure), note et nombre d'avis.
// À part du menu pour que la carte s'affiche sans attendre Google. FERMÉE comme le reste (404 sans le drapeau ET le forfait).
//
// AUCUN cache (conditions Google Maps Platform) : chaque réponse coûte un appel « Place Details Enterprise ». D'où la limite
// par adresse ; au-delà, la page n'a pas de réponse et c'est le serveur qui juge à l'envoi.
//
// GET /api/site-orders/fiche?restaurantId=…[&depuis=app]  → FicheView (lib/site-orders/fiche.ts)
// Trace (ADR 0065) : un compteur par réponse dans `site_order_refusals` (`fiche_vue_…`, `entree_app`), sans donnée du client.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId || !(await siteOrdersAvailable(restaurantId))) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "inconnue";
  if (!(await checkIpRateLimit(hashIp(ip), "site_order_fiche", 60, 600))) {
    console.warn(`[site-orders-fiche] restaurant=${restaurantId} limite par adresse atteinte`);
    return NextResponse.json({ error: "Trop de demandes. Réessaie dans quelques minutes." }, { status: 429 });
  }

  try {
    const now = new Date();
    const read = await readFiche(restaurantId);
    const view = ficheView(read, now);
    const db = supabaseOrdersDb();
    await db.recordRefusal(restaurantId, viewReason(read, view));
    if (req.nextUrl.searchParams.get("depuis") === "app") await db.recordRefusal(restaurantId, APP_ENTRY_REASON);
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[site-orders-fiche]", e);
    return NextResponse.json({ error: "Un souci de notre côté." }, { status: 500 });
  }
}
