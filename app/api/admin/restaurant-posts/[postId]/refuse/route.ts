import { NextResponse, type NextRequest } from "next/server";
import { refusePost } from "@/lib/restaurant-posts/auto/actions";
import { autoDeps } from "@/lib/restaurant-posts/auto/server";
import { postsCatch, postsError, postsFailure, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";

// ADR 0112 — « Ne pas publier » depuis la console.
// POST /api/admin/restaurant-posts/<id>/refuse  { restaurantId }  →  { ok: true }

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const body = await readJsonBody(req, 1024);
  if (!body) return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await refusePost(autoDeps(), { restaurantId, postId, userId: guard.userId });
    return res.ok ? NextResponse.json({ ok: true }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "refus");
  }
}
