import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { loadWeeklyReport } from "@/lib/site-orders/report-db";
import { SiteOrdersUnavailableError } from "@/lib/site-orders/service";

// ADR 0108 §6 — le rapport de la semaine de l'espace de commande. Fermé comme le reste : sans le drapeau ET le forfait Pro, 404.
// Lecture seule, réservée aux admins de l'établissement (il porte des euros).
//
// GET /api/admin/site-orders/report?restaurantId=…  →  { report: WeeklyReport }

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  try {
    return NextResponse.json({ report: await loadWeeklyReport(restaurantId) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof SiteOrdersUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[site-orders] rapport :", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
