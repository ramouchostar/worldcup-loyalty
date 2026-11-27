import { NextResponse, type NextRequest } from "next/server";
import { saveAutoSettings, stopAuto } from "@/lib/restaurant-posts/auto/actions";
import { autoDeps } from "@/lib/restaurant-posts/auto/server";
import { postsCatch, postsError, postsFailure, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";

// ADR 0112 — la publication automatique : activer ou régler, arrêter. Gérant ou manager seulement, jamais la
// plateforme à sa place.
// POST   /api/admin/restaurant-posts/auto  { restaurantId, kinds, accepted }  →  { settings: { enabled, kinds } }
// DELETE /api/admin/restaurant-posts/auto?restaurantId=…                      →  { ok: true }

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req, 2048);
  if (!body) return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await saveAutoSettings(autoDeps(), { restaurantId, userId: guard.userId, kinds: body.kinds, accepted: body.accepted === true });
    return res.ok ? NextResponse.json({ settings: { enabled: res.settings.enabled, kinds: res.settings.kinds } }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "publication automatique, réglage");
  }
}

export async function DELETE(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await stopAuto(autoDeps(), { restaurantId, userId: guard.userId });
    return res.ok ? NextResponse.json({ ok: true }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "publication automatique, arrêt");
  }
}
