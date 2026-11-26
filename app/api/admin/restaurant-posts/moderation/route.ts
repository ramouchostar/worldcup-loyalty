import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsCatch, postsError, postsFailure, readJsonBody } from "@/lib/restaurant-posts/guard";
import { moderatePost, type ModerationTarget } from "@/lib/restaurant-posts/service";

// ADR 0111 §6-§7 — Boosteats MASQUE un article (motif lu par le gérant) ou lève le masquage. Réservé au super-admin.
// La plateforme ne publie jamais : lever le masquage laisse l'article « retiré », c'est le restaurant qui dit
// « Oui, publier ». Aucun écran pour l'instant (la maquette n'en montre pas). Volontairement ouvert même si l'espace de
// commande est fermé pour l'établissement : on doit toujours pouvoir masquer.
//
// POST /api/admin/restaurant-posts/moderation
//   { action: "masquer" | "demasquer", reason, postId }                      ou
//   { action: "masquer" | "demasquer", reason, restaurantId, slug }          (le motif est exigé pour masquer)
//   →  { post: { id, status } }

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const body = await readJsonBody(req, 2048);
  const action = body?.action === "masquer" || body?.action === "demasquer" ? body.action : null;
  const target: ModerationTarget | null =
    typeof body?.postId === "string" ? { postId: body.postId }
    : typeof body?.restaurantId === "string" && typeof body?.slug === "string" ? { restaurantId: body.restaurantId, slug: body.slug }
    : null;
  if (!body || !action || !target) return postsError("Requête invalide : action, puis postId (ou restaurantId et slug).", 400);
  try {
    const res = await moderatePost(supabasePostsDb(), { target, action, reason: typeof body.reason === "string" ? body.reason : "", userId: guard.userId });
    return res.ok ? NextResponse.json({ post: { id: res.post.id, status: res.post.status } }) : postsFailure(res);
  } catch (e) {
    return postsCatch(e, "masquage");
  }
}
