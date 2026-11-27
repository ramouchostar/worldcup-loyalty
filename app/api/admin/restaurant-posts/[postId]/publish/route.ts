import { NextResponse, type NextRequest } from "next/server";
import { supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsCatch, postsError, postsFailure, readDishIds, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";
import { publishPost } from "@/lib/restaurant-posts/service";

// ADR 0111 §3, §5, §7 — « Oui, publier » : le seul chemin vers un article public. Le serveur recontrôle la version
// relue (`revision`) ; publier n'envoie aucun message à personne.
// POST /api/admin/restaurant-posts/<id>/publish  { restaurantId, revision, rightsConfirmed }  →  { post: { slug } }

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const body = await readJsonBody(req, 1024);
  if (!body || typeof body.revision !== "number") return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await publishPost(supabasePostsDb(), {
      restaurantId,
      postId,
      userId: guard.userId,
      revision: body.revision,
      rightsConfirmed: body.rightsConfirmed === true,
      dishIds: await readDishIds(restaurantId),
    });
    return res.ok ? NextResponse.json({ post: { slug: res.post.slug } }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "publication");
  }
}
