import { NextResponse, type NextRequest } from "next/server";
import { restaurantName } from "@/lib/restaurant-posts/db";
import { readPostCards } from "@/lib/restaurant-posts/public-db";
import { siteOrdersAvailable } from "@/lib/site-orders/access";

// ADR 0111 §1 — le dernier article en ligne, pour le bloc « Nos articles » de la page de commande. Mêmes portes que la
// commande (drapeau ET forfait : 404 sinon). Sans article, ou tables pas encore créées : `latest: null`, le bloc n'existe pas.
//
// GET /api/restaurant-posts/latest?restaurantId=…  →  { latest: PostCard | null }

export const dynamic = "force-dynamic";

const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId || !(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  try {
    if ((await restaurantName(restaurantId)) === null) return NOT_FOUND();
    const [latest] = await readPostCards(restaurantId, 1);
    return NextResponse.json({ latest: latest ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[blog] dernier article :", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
