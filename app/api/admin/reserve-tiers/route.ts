import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getAverageBasket } from "@/lib/avg-basket";
import { DEFAULT_BUDGET_PCT } from "@/lib/reward-sizing";
import { getCataloguePct } from "@/lib/points";

const BUDGET_PCT = parseFloat(process.env.REWARD_BUDGET_PCT ?? String(DEFAULT_BUDGET_PCT));

// ADR 0060 — ce dont l'écran Menu a besoin pour les gros cadeaux de la
// réserve : le panier moyen (seuils calculés, tickets moyens, plafonds) et le
// budget cadeaux. Surface admin uniquement : ce sont des euros (ADR 0007).
// L'enregistrement passe par PUT /api/admin/reward-tiers, qui re-vérifie le
// plafond côté serveur.

// GET /api/admin/reserve-tiers?restaurantId=...
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const avgBasket = await getAverageBasket(restaurantId);
  // `cataloguePct` : le taux qui fixe réellement les prix en points (réglage
  // par établissement, ADR 0061) — l'écran Menu affiche les mêmes prix que
  // le membre.
  const cataloguePct = await getCataloguePct(restaurantId).catch(() => BUDGET_PCT);
  return NextResponse.json({ avgBasket, budgetPct: BUDGET_PCT, cataloguePct });
}
