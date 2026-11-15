import { NextResponse, type NextRequest } from "next/server";
import { hashIp } from "@/lib/rate-limit";
import { todayInBrussels } from "@/lib/qr-funnel";
import { offerWindow, voucherCookieName } from "@/lib/ads/vouchers";
import { getVoucherForDevice, issueVoucher, loadVoucherPage, vouchersReady } from "@/lib/ads/vouchers-data";

// ADR 0104 §2 — « Obtenir mon bon » sur la page /bon/<établissement>/<n°>. PUBLIQUE, sans compte
// et sans donnée personnelle. Un appareil garde son bon (cookie strictement nécessaire, il ne
// porte que l'identifiant du bon) : un second appui rend le même. Au plus 20 bons par heure
// pour une même empreinte d'IP (jamais l'IP en clair).
//
// POST /api/bons  { restaurantId, seq }  → 200 { code, token, redeemedAt }  ou  4xx/5xx { error }

export async function POST(req: NextRequest) {
  let body: { restaurantId?: unknown; seq?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // corps illisible : traité comme une demande vide
  }
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const seq = typeof body.seq === "number" ? body.seq : Number(body.seq);
  const page = restaurantId ? await loadVoucherPage(restaurantId, seq) : null;
  if (!page) return NextResponse.json({ error: "Cette offre n'existe pas ou n'est plus proposée." }, { status: 404 });
  if (offerWindow(page.offer, todayInBrussels()) === "finie") {
    return NextResponse.json({ error: "Cette offre est terminée." }, { status: 410 });
  }
  if (!(await vouchersReady())) {
    console.error("[bon] tables absentes : migration 20261115-1200-bons-de-pub à appliquer");
    return NextResponse.json({ error: "Les bons ne sont pas encore disponibles. Montre cette page à la caisse." }, { status: 503 });
  }

  const cookieName = voucherCookieName(page.requestId);
  const kept = req.cookies.get(cookieName)?.value;
  const existing = kept ? await getVoucherForDevice(kept, page.requestId) : null;
  if (existing) return NextResponse.json({ code: existing.code, token: existing.token, redeemedAt: existing.redeemed_at });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "inconnue";
  const issued = await issueVoucher(page, hashIp(ip));
  if (!issued.ok) {
    return issued.reason === "limite"
      ? NextResponse.json({ error: "Trop de bons demandés depuis ce réseau. Réessaie dans une heure." }, { status: 429 })
      : NextResponse.json({ error: "Le bon n'a pas pu être créé. Réessaie dans un instant." }, { status: 500 });
  }
  console.info(`[bon] obtenu restaurant=${page.restaurantId} demande=${page.requestId}`);

  const res = NextResponse.json({ code: issued.voucher.code, token: issued.voucher.token, redeemedAt: null });
  // Gardé jusqu'à une semaine après la fin de l'offre.
  const until = Date.parse(`${page.offer.to}T23:59:59Z`) + 7 * 86_400_000;
  res.cookies.set(cookieName, issued.voucher.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(3600, Math.round((until - Date.now()) / 1000)),
  });
  return res;
}
