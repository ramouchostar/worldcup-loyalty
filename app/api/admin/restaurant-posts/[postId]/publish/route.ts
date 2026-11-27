import { NextResponse, type NextRequest } from "next/server";
import { publishNow } from "@/lib/restaurant-posts/auto/actions";
import { autoDeps, occasionOfPost } from "@/lib/restaurant-posts/auto/server";
import { PENDING_STATUSES } from "@/lib/restaurant-posts/auto/types";
import { supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsCatch, postsError, postsFailure, readDishIds, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";
import { publishPost } from "@/lib/restaurant-posts/service";

// ADR 0111 §3, §5, §7 — « Oui, publier » : le serveur recontrôle la version relue (`revision`) ; publier n'envoie aucun
// message à personne. Pour un article automatique qui attend (ADR 0112), c'est « Publier maintenant » : l'occasion est
// revérifiée et l'article garde sa fin. L'autre chemin vers un article public est la tâche planifiée de l'ADR 0112.
// POST /api/admin/restaurant-posts/<id>/publish  { restaurantId, revision, rightsConfirmed }  →  { post: { slug } }

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const body = await readJsonBody(req, 1024);
  if (!body || typeof body.revision !== "number") return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const said = { userId: guard.userId, revision: body.revision, rightsConfirmed: body.rightsConfirmed === true };
    const occasion = await occasionOfPost(restaurantId, postId);
    const res =
      occasion && PENDING_STATUSES.includes(occasion.status)
        ? await publishNow(autoDeps(), occasion, said)
        : await publishPost(supabasePostsDb(), { restaurantId, postId, ...said, dishIds: await readDishIds(restaurantId) });
    return res.ok ? NextResponse.json({ post: { slug: res.post.slug } }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "publication");
  }
}
