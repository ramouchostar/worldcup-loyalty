import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { readWhatsApp, saveWhatsApp } from "@/lib/site-orders/settings";
import { cleanWhatsAppNumber, formatWhatsApp } from "@/lib/site-orders/whatsapp";

// ADR 0107 §10 — le numéro WhatsApp de commande : celui où un client envoie sa commande quand le site ne peut pas la prendre.
// Console seulement, fermé comme la commande elle-même (le drapeau SITE_ORDER_RESTAURANTS ET le forfait : 404 sinon).
//
// GET /api/admin/site-orders/whatsapp?restaurantId=…                  → { number: string | null, display: string | null }
// PUT /api/admin/site-orders/whatsapp  { restaurantId, number: string } → { number, display }   (« » efface le numéro)
//   « 0470 12 34 56 », « +32 470 12 34 56 » et « 0032… » donnent le même numéro ; un numéro sans indicatif ni « 0 » de tête est refusé.

const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });
const view = (n: string | null) => ({ number: n, display: n ? formatWhatsApp(n) : null });

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  return NextResponse.json(view(await readWhatsApp(restaurantId)));
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId || typeof body?.number !== "string") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();

  const raw = body.number.trim();
  const number = raw === "" ? null : cleanWhatsAppNumber(raw);
  if (raw !== "" && number === null) {
    return NextResponse.json({ error: "Ce numéro n'est pas lisible. Exemple : 0470 12 34 56, ou +32 470 12 34 56." }, { status: 400 });
  }
  const r = await saveWhatsApp(restaurantId, number, guard.userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  console.info(`[site-orders-whatsapp] restaurant=${restaurantId} user=${guard.userId} numero=${number ? "pose" : "efface"}`);
  return NextResponse.json(view(number));
}
