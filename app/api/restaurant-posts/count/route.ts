import { NextResponse, type NextRequest } from "next/server";
import { checkIpRateLimit, hashIp } from "@/lib/rate-limit";
import { todayInBrussels } from "@/lib/qr-funnel";
import { restaurantName, supabasePostsDb } from "@/lib/restaurant-posts/db";
import { readJsonBody } from "@/lib/restaurant-posts/guard";
import { countPost, findOnlinePost, PostsUnavailableError } from "@/lib/restaurant-posts/service";
import { POST_COUNTERS } from "@/lib/restaurant-posts/types";
import { siteOrdersAvailable } from "@/lib/site-orders/access";

// ADR 0111, Trace — compter, par article et par jour, les lectures et les appuis sur « Voir la carte ». AUCUNE donnée sur
// le lecteur : ni adresse, ni empreinte, ni cookie, ni compte. Contre le gonflement, un plafond PAR ARTICLE (la clé
// limitée est celle de l'article, pas celle d'une personne). Les robots peuvent être comptés : c'est dit dans l'ADR.
//
// POST /api/restaurant-posts/count  { restaurantId, slug, event: "lecture" | "carte" }  → 204

const MAX_PER_HOUR = 600;
const nothing = (status: number) => new NextResponse(null, { status });

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req, 1024);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const event = POST_COUNTERS.find((c) => c === body?.event);
  if (!restaurantId || !event) return nothing(400);
  if (!(await siteOrdersAvailable(restaurantId))) return nothing(404);
  try {
    if ((await restaurantName(restaurantId)) === null) return nothing(404);
    const db = supabasePostsDb();
    const post = await findOnlinePost(db, restaurantId, body?.slug);
    if (!post) return nothing(404);
    if (!(await checkIpRateLimit(hashIp(`article:${post.id}`), `post_count_${event}`, MAX_PER_HOUR, 3600))) return nothing(429);
    await countPost(db, post, event, todayInBrussels());
    return nothing(204);
  } catch (e) {
    if (e instanceof PostsUnavailableError) return nothing(503);
    console.error("[blog] compteur :", e);
    return nothing(500);
  }
}
