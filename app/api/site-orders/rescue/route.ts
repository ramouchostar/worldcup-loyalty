import { NextResponse, type NextRequest } from "next/server";
import { checkIpRateLimit, hashIp } from "@/lib/rate-limit";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { supabaseOrdersDb } from "@/lib/site-orders/db";
import { RESCUE_EVENTS } from "@/lib/site-orders/rescue";

// ADR 0107 §10 — la trace du secours WhatsApp : combien de fois la page a proposé « Envoyer ma commande via WhatsApp », combien
// de fois le client a TOUCHÉ le bouton, combien de fois il a copié le message. Seuls des compteurs : aucune donnée du client, aucun
// plat, aucun numéro. Ce qu'on ne voit pas, et qu'on ne prétend pas voir : si le client a ensuite appuyé sur « Envoyer » dans WhatsApp.
// Fermée comme la commande (le drapeau ET le forfait : 404 sinon).
//
// POST /api/site-orders/rescue  { restaurantId, event: "propose" | "whatsapp" | "copie" }  → 204

const MAX_BODY = 1024;

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (text.length === 0 || text.length > MAX_BODY) return new NextResponse(null, { status: 400 });
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const event = typeof body?.event === "string" ? body.event : "";
  const reason = (RESCUE_EVENTS as Record<string, string | undefined>)[event];
  if (!restaurantId || !reason) return new NextResponse(null, { status: 400 });
  if (!(await siteOrdersAvailable(restaurantId))) return new NextResponse(null, { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "inconnue";
  if (!(await checkIpRateLimit(hashIp(ip), "site_order_rescue", 40, 600))) return new NextResponse(null, { status: 429 });

  await supabaseOrdersDb().recordRefusal(restaurantId, reason);
  return new NextResponse(null, { status: 204 });
}
