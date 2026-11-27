import { NextResponse, type NextRequest } from "next/server";
import { nextVersion } from "@/lib/restaurant-posts/auto/actions";
import { autoDeps } from "@/lib/restaurant-posts/auto/server";
import { postsCatch, postsError, postsFailure, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";

// ADR 0112 — « Autre version » : la version suivante des phrases préparées, avant publication.
// POST /api/admin/restaurant-posts/<id>/variant  { restaurantId, revision }  →  { post: { revision } }

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const body = await readJsonBody(req, 1024);
  if (!body || typeof body.revision !== "number") return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await nextVersion(autoDeps(), { restaurantId, postId, revision: body.revision });
    return res.ok ? NextResponse.json({ post: { revision: res.post.revision } }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "autre version");
  }
}
