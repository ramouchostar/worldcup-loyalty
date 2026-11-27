import { NextResponse, type NextRequest } from "next/server";
import { checkIpRateLimit, hashIp } from "@/lib/rate-limit";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { supabaseOffersDb } from "@/lib/site-offers/db";
import { OffersUnavailableError, publicOffers, recordSeen } from "@/lib/site-offers/service";

// ADR 0110 §4 — les offres valables aujourd'hui, pour la page de commande. À part de la carte : une panne ici cache les
// offres, jamais la carte. FERMÉE comme la commande (404 sans le drapeau ET le forfait). Aucun cache : la page relit quand le
// client y revient, et le lendemain du dernier jour le serveur ne renvoie plus l'offre.
//
// GET  /api/site-orders/offers?restaurantId=…                      → { offers: PublicOffer[] }
// POST /api/site-orders/offers { restaurantId, kind, offerIds }    → 204   (kind : affichee | ouverte ; aucune donnée du client)

export const dynamic = "force-dynamic";

const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId || !(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  try {
    return NextResponse.json({ offers: await publicOffers(supabaseOffersDb(), restaurantId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Migration pas appliquée : la page reste comme avant. Une panne : les offres sont masquées, et le journal le dit.
    if (e instanceof OffersUnavailableError) return NextResponse.json({ offers: [] }, { headers: { "Cache-Control": "no-store" } });
    console.error(`[site-offers] offres masquées, lecture impossible : restaurant=${restaurantId}`, e);
    return NextResponse.json({ error: "Un souci de notre côté." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = text.length > 0 && text.length <= 2048 ? JSON.parse(text) : null;
    body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  if (!restaurantId || !(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "inconnue";
  // Une salle entière partage une adresse : large, mais pas sans limite.
  if (!(await checkIpRateLimit(hashIp(ip), "site_offer_seen", 120, 600))) return NextResponse.json({ error: "Trop de demandes." }, { status: 429 });
  try {
    const res = await recordSeen(supabaseOffersDb(), { restaurantId, kind: body.kind, offerIds: body.offerIds });
    return res.ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: res.error }, { status: res.status });
  } catch (e) {
    if (!(e instanceof OffersUnavailableError)) console.error(`[site-offers] affichage non compté : restaurant=${restaurantId}`, (e as Error).message);
    return new NextResponse(null, { status: 204 }); // un compteur ne dérange jamais le client
  }
}
