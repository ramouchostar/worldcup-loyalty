import { NextResponse, type NextRequest } from "next/server";
import { checkIpRateLimit, hashIp } from "@/lib/rate-limit";
import { restaurantName, supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsError, readJsonBody } from "@/lib/restaurant-posts/guard";
import { findOnlinePost, PostsUnavailableError, reportPost } from "@/lib/restaurant-posts/service";
import { siteOrdersAvailable } from "@/lib/site-orders/access";

// ADR 0111 §7 — « Signaler cet article ». Boosteats reçoit le signalement (trace `restaurant_post_events` et journal),
// sans rien sur la personne qui signale. Limité en nombre : par adresse (empreinte, jamais l'IP en clair, utilisée pour
// la limite seulement) et par article.
//
// POST /api/restaurant-posts/report  { restaurantId, slug }  → 204

const PER_ADDRESS = { max: 5, window: 3600 };
const PER_POST = { max: 30, window: 24 * 3600 };

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req, 1024);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return postsError("Requête invalide.", 400);
  if (!(await siteOrdersAvailable(restaurantId))) return postsError("Introuvable.", 404);
  try {
    if ((await restaurantName(restaurantId)) === null) return postsError("Introuvable.", 404);
    const db = supabasePostsDb();
    const post = await findOnlinePost(db, restaurantId, body?.slug);
    if (!post) return postsError("Introuvable.", 404);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "inconnue";
    const tooMany = () => postsError("Trop de signalements pour le moment. Réessaie plus tard.", 429);
    if (!(await checkIpRateLimit(hashIp(ip), "post_report", PER_ADDRESS.max, PER_ADDRESS.window))) return tooMany();
    if (!(await checkIpRateLimit(hashIp(`article:${post.id}`), "post_report_article", PER_POST.max, PER_POST.window))) return tooMany();
    await reportPost(db, post);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof PostsUnavailableError) return postsError(e.message, 503);
    console.error("[blog] signalement :", e);
    return postsError("Un souci de notre côté. Réessaie dans un instant.", 500);
  }
}
