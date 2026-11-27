import { NextResponse, type NextRequest } from "next/server";
import { supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsCatch, postsError, postsFailure, readJsonBody, requirePostWriter } from "@/lib/restaurant-posts/guard";
import { withdrawPost } from "@/lib/restaurant-posts/service";

// ADR 0111 §6 — « Retirer de la page » : agit tout de suite.
// POST /api/admin/restaurant-posts/<id>/withdraw  { restaurantId }  →  { ok: true }

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const body = await readJsonBody(req, 1024);
  if (!body) return postsError("Requête invalide.", 400);
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    const res = await withdrawPost(supabasePostsDb(), { restaurantId, postId, userId: guard.userId });
    return res.ok ? NextResponse.json({ ok: true }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "retrait");
  }
}
