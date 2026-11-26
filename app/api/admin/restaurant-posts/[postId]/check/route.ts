import { NextResponse, type NextRequest } from "next/server";
import { supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsCatch, postsError, postsFailure, readDishIds, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";
import { checkDraft } from "@/lib/restaurant-posts/service";

// ADR 0111 §7 — le contrôle du brouillon, joué à l'ouverture de l'aperçu : ce qui bloque est dit avant le bouton, et
// tracé (`restaurant_post_events`, « refuse », un motif par ligne).
// POST /api/admin/restaurant-posts/<id>/check  { restaurantId }  →  { issues, revision }

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const body = await readJsonBody(req, 1024);
  if (!body) return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await checkDraft(supabasePostsDb(), { restaurantId, postId, userId: guard.userId, dishIds: await readDishIds(restaurantId) });
    return res.ok ? NextResponse.json({ issues: res.issues, revision: res.revision }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "contrôle");
  }
}
