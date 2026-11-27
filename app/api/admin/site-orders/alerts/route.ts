import { NextResponse, type NextRequest } from "next/server";
import { canManageEstablishment, getAdminAccess, requireAdmin } from "@/lib/admin-guard";
import { supabaseOrdersDb } from "@/lib/site-orders/db";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { computeAlerts, refusalsSince } from "@/lib/site-orders/nina-alerts";
import { readHoursAlert } from "@/lib/site-orders/nina-hours";
import { SiteOrdersUnavailableError, listRecentOrders } from "@/lib/site-orders/service";

// ADR 0108 §6 — les alertes de Nina sur l'espace de commande, lues dans la console. Fermée comme le reste : sans le drapeau ET le
// forfait Pro, 404. Lecture seule : les commandes des dernières 24 h (et toutes les ouvertes), les refus des 12 dernières heures
// et, pour le gérant ou le manager, ce qui manque pour que la page lise des horaires (aucun appel à Google).
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
    const [orders, refusals, hours] = await Promise.all([
      listRecentOrders(db, restaurantId, now),
      db.countRefusals(restaurantId, refusalsSince(now)),
      // Seuls le gérant et le manager peuvent saisir des horaires. Une lecture en échec ne fait taire aucune autre alerte.
      getAdminAccess(guard.userId, restaurantId)
        .then((access) => (canManageEstablishment(access) ? readHoursAlert(restaurantId, now) : null))
        .catch((e) => {
          console.error("[site-orders] alerte des horaires illisible :", e instanceof Error ? e.message : e);
          return null;
        }),
    ]);
    return NextResponse.json({ alerts: computeAlerts({ orders, refusals, now: now.getTime(), hours }) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof SiteOrdersUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[site-orders] alertes :", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
