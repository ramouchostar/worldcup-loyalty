import { NextResponse, type NextRequest } from "next/server";
import { checkIpRateLimit, hashIp } from "@/lib/rate-limit";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { supabaseOrdersDb } from "@/lib/site-orders/db";
import { APP_ENTRY_REASON, ficheView, viewReason, type FicheRead } from "@/lib/site-orders/fiche";
import { readFiche } from "@/lib/site-orders/fiche-db";
import { usesOwnHours } from "@/lib/site-orders/hours-source";
import { readPageSettings } from "@/lib/site-orders/page-settings-db";

// ADR 0108 §4, ADR 0109 §3 — ce que l'accueil de l'espace dit du restaurant : ouvert ou fermé (avec l'heure, d'après la
// source choisie : `lib/site-orders/hours-source.ts`), note et nombre d'avis de la fiche Google. À part du menu pour que la
// carte s'affiche sans attendre Google. FERMÉE comme le reste (404 sans le drapeau ET le forfait).
//
// AUCUN cache (conditions Google Maps Platform) : chaque réponse d'un établissement relié à une fiche coûte un appel « Place
// Details Enterprise », pour la note même quand les horaires sont les siens. D'où la limite par adresse ; au-delà, la page
// n'a pas de réponse et c'est le serveur qui juge à l'envoi.
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
    const settings = await readPageSettings(restaurantId);
    let read: FicheRead | null;
    if (usesOwnHours(settings)) {
      // La note est un simple affichage : quoi qu'il arrive en la lisant, les horaires du restaurant restent servis.
      read = await readFiche(restaurantId, "note").catch((e) => {
        console.error(`[site-orders-fiche] restaurant=${restaurantId} note non lue :`, e instanceof Error ? e.message : e);
        return null;
      });
    } else {
      read = await readFiche(restaurantId);
    }
    const view = ficheView(read, now, settings);
    const db = supabaseOrdersDb();
    await db.recordRefusal(restaurantId, viewReason(read, view));
    if (req.nextUrl.searchParams.get("depuis") === "app") await db.recordRefusal(restaurantId, APP_ENTRY_REASON);
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[site-orders-fiche]", e);
    return NextResponse.json({ error: "Un souci de notre côté." }, { status: 500 });
  }
}
