import { NextResponse } from "next/server";
import { checkQrUrl, QR_REASON_TEXT } from "@/lib/qr-check";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/qr-check — « tester le scan » : l'adresse du QR code mène-t-elle quelque part ?
// Body : { restaurantId, url }. Le serveur va chercher l'adresse (https seulement, jamais une adresse interne : lib/safe-url.ts).
// Un plafond par personne et par minute : ce n'est pas un outil pour sonder des sites.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, number[]>();

function allowed(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return false;
  }
  hits.set(userId, [...recent, now]);
  if (hits.size > 5_000) hits.clear(); // jamais de croissance sans borne
  return true;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;
  if (!allowed(guard.userId)) return NextResponse.json({ error: "Trop d'essais : réessaie dans une minute.", reason: "rate_limited" }, { status: 429 });

  const url = typeof body?.url === "string" ? body.url : "";
  const r = await checkQrUrl(url);
  if (r.ok) return NextResponse.json({ ok: true, finalHost: r.finalHost, redirected: r.redirected });
  return NextResponse.json({ error: QR_REASON_TEXT[r.reason], reason: `qr_${r.reason}` }, { status: r.reason === "unreachable" || r.reason === "bad_status" ? 502 : 422 });
}
