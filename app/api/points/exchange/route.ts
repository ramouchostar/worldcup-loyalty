import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { exchangePointsForGift } from "@/lib/points";

// POST /api/points/exchange { restaurantId, tierId } — échange la réserve
// contre un gros cadeau (ADR 0021). Le RPC est transactionnel : le cadeau
// créé suit le cycle coupon existant (10 min / cashier, ADR 0011).
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  const tierId = body?.tierId;
  if (typeof restaurantId !== "string" || !restaurantId || typeof tierId !== "string" || !tierId) {
    return NextResponse.json({ error: "restaurantId et tierId requis." }, { status: 400 });
  }

  try {
    const result = await exchangePointsForGift(user.id, restaurantId, tierId);
    if ("error" in result) {
      // Messages neutres — jamais de coûts ni de vraie mécanique (ADR 0007)
      switch (result.error) {
        case "insufficient_points":
          return NextResponse.json(
            { error: "Ta réserve ne suffit pas encore pour ce cadeau." },
            { status: 400 }
          );
        case "active_reward_exists":
          return NextResponse.json(
            { error: "Récupère ou mets de côté ton cadeau actuel avant d'échanger ta réserve." },
            { status: 409 }
          );
        default:
          return NextResponse.json({ error: "Ce cadeau n'est plus disponible." }, { status: 400 });
      }
    }
    return NextResponse.json({ rewardId: result.rewardId });
  } catch (err) {
    console.error("[points/exchange] échec:", err);
    return NextResponse.json({ error: "Erreur serveur. Réessaie." }, { status: 500 });
  }
}
