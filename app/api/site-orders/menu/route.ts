import { NextResponse, type NextRequest } from "next/server";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { readPublicMenu } from "@/lib/site-orders/menu-db";

// ADR 0099 §2 et §8 — le menu que le client voit sur la page de commande. FERMÉ comme la commande : sans le drapeau
// SITE_ORDER_RESTAURANTS ET un forfait Pro actif (Nina), 404 comme si la route n'existait pas.
//
// GET /api/site-orders/menu?restaurantId=…  → PublicMenu (lib/site-orders/menu.ts) : plats commandables, prix, options,
//   allergènes confirmés. Rien d'interne ne sort (ni prix de revient, ni coin de cuisine).

const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId || !(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  try {
    const menu = await readPublicMenu(restaurantId);
    if (!menu) return NOT_FOUND();
    if (menu.hidden > 0) console.info(`[site-orders-menu] restaurant=${restaurantId} plats_caches=${menu.hidden}`);
    return NextResponse.json(menu, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[site-orders-menu]", e);
    return NextResponse.json({ error: "Un souci de notre côté. Réessaie dans un instant, ou appelle le restaurant." }, { status: 500 });
  }
}
