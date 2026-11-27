import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseOrdersDb } from "@/lib/site-orders/db";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { SiteOrdersUnavailableError, changeStatus, listRecentOrders, type OrderView } from "@/lib/site-orders/service";
import { withOffers, type ConsoleOrder } from "@/lib/site-offers/console";
import { readOfferAnswers, supabaseOffersDb } from "@/lib/site-offers/db";

// ADR 0099 §2 — les commandes du site vues par le restaurateur (console seulement : prénom, téléphone, euros).
// Fermées comme la commande elle-même : sans SITE_ORDER_RESTAURANTS qui liste l'établissement ET un forfait Pro actif, 404.
//
// GET   /api/admin/site-orders?restaurantId=…  → { orders: ConsoleOrder[] }  (dernières 24 h + toutes les commandes encore
//        ouvertes, avec les offres affichées à la commande, ADR 0110 §5)
// PATCH /api/admin/site-orders  { restaurantId, id, status: "prete" | "retiree" | "annulee", reason? }

const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });

/** Les offres des commandes ; illisibles, les cartes le disent au lieu de se taire. */
async function attachOffers(restaurantId: string, orders: OrderView[]): Promise<ConsoleOrder[]> {
  const ids = [...new Set(orders.flatMap((o) => o.offerIds))];
  if (ids.length === 0) return withOffers(orders, [], new Map());
  try {
    const [offers, answers] = await Promise.all([
      supabaseOffersDb().byIds(restaurantId, ids),
      readOfferAnswers(restaurantId, orders.filter((o) => o.offerIds.length > 0).map((o) => o.id)),
    ]);
    return withOffers(orders, offers, answers);
  } catch (e) {
    console.error(`[site-offers] restaurant=${restaurantId} offres des commandes illisibles :`, e);
    return withOffers(orders, null, new Map());
  }
}

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  try {
    return NextResponse.json({ orders: await attachOffers(restaurantId, await listRecentOrders(supabaseOrdersDb(), restaurantId)) });
  } catch (e) {
    if (e instanceof SiteOrdersUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[site-orders] liste :", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const id = typeof body?.id === "string" ? body.id : "";
  if (!restaurantId || !id) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  try {
    const r = await changeStatus(supabaseOrdersDb(), restaurantId, id, body.status, body.reason);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    console.info(`[site-orders-etat] restaurant=${restaurantId} user=${guard.userId} etat=${String(body.status)}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SiteOrdersUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[site-orders] état :", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
