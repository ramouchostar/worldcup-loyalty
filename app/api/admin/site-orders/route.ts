import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseOrdersDb } from "@/lib/site-orders/db";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { SiteOrdersUnavailableError, changeStatus, listRecentOrders } from "@/lib/site-orders/service";

// ADR 0099 §2 — les commandes du site vues par le restaurateur (console seulement : prénom, téléphone, euros).
// Fermées comme la commande elle-même : sans SITE_ORDER_RESTAURANTS qui liste l'établissement ET un forfait Pro actif, 404.
//
// GET   /api/admin/site-orders?restaurantId=…  → { orders: OrderView[] }  (dernières 24 h + toutes les commandes encore ouvertes)
// PATCH /api/admin/site-orders  { restaurantId, id, status: "prete" | "retiree" | "annulee", reason? }

const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  try {
    return NextResponse.json({ orders: await listRecentOrders(supabaseOrdersDb(), restaurantId) });
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
