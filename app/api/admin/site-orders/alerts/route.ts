import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseOrdersDb } from "@/lib/site-orders/db";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { computeAlerts, refusalsSince } from "@/lib/site-orders/nina-alerts";
import { SiteOrdersUnavailableError, listRecentOrders } from "@/lib/site-orders/service";

// ADR 0108 §6 — les alertes de Nina sur l'espace de commande, lues dans la console. Fermée comme le reste : sans le drapeau ET le
// forfait Pro, 404. Lecture seule : les commandes des dernières 24 h (et toutes les ouvertes) et les refus des 12 dernières heures.
//
// GET /api/admin/site-orders/alerts?restaurantId=…  →  { alerts: NinaAlert[] }   (liste VIDE = rien à signaler)

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  const now = new Date();
  try {
    const db = supabaseOrdersDb();
    const [orders, refusals] = await Promise.all([listRecentOrders(db, restaurantId, now), db.countRefusals(restaurantId, refusalsSince(now))]);
    return NextResponse.json({ alerts: computeAlerts({ orders, refusals, now: now.getTime() }) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof SiteOrdersUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[site-orders] alertes :", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
