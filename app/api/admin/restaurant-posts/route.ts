import { NextResponse, type NextRequest } from "next/server";
import { supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsCatch, postsError, postsFailure, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";
import { createDraft } from "@/lib/restaurant-posts/service";

// ADR 0111 — un nouveau brouillon d'article (gérant ou manager ; fermé comme la commande).
// POST /api/admin/restaurant-posts  { restaurantId, content: { title, blocks } }  →  { post: { id, revision } }

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req, 100_000);
  if (!body) return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await createDraft(supabasePostsDb(), { restaurantId, userId: guard.userId, raw: body.content });
    return res.ok ? NextResponse.json({ post: { id: res.post.id, revision: res.post.revision } }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "création");
  }
}
