import { NextResponse } from "next/server";
import { reviewProvider } from "@/lib/missions-reviews";
import { reviewResponse } from "@/lib/missions-reviews-http";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/review — le restaurateur note son prestataire, une fois la livraison validée. Définitif.
// Body : { restaurantId, rating: 1..5, comment? }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;
  return reviewResponse(await reviewProvider(id, restaurantId, guard.userId, body));
}
