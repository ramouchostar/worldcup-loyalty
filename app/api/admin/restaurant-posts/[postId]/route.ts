import { NextResponse, type NextRequest } from "next/server";
import { supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsCatch, postsError, postsFailure, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";
import { deletePost, saveDraft } from "@/lib/restaurant-posts/service";

// ADR 0111 — garder le brouillon (la version en ligne ne bouge pas) et supprimer l'article avec ses photos.
// PUT    /api/admin/restaurant-posts/<id>  { restaurantId, revision, content }  →  { post: { id, revision } }
// DELETE /api/admin/restaurant-posts/<id>?restaurantId=…                       →  { ok: true }

type Ctx = { params: Promise<{ postId: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { postId } = await params;
  const body = await readJsonBody(req, 100_000);
  if (!body || typeof body.revision !== "number") return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await saveDraft(supabasePostsDb(), { restaurantId, postId, revision: body.revision, raw: body.content });
    return res.ok ? NextResponse.json({ post: { id: res.post.id, revision: res.post.revision } }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "brouillon");
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { postId } = await params;
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await deletePost(supabasePostsDb(), { restaurantId, postId, userId: guard.userId });
    return res.ok ? NextResponse.json({ ok: true }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "suppression");
  }
}
