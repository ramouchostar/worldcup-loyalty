import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { exchangeCatalogueItem } from "@/lib/points";

// POST /api/points/exchange { restaurantId, itemId } — échange des points
// contre un article du catalogue (ADR 0061). Le prix est recalculé en SQL
// (`exchange_points_for_item`) : rien de ce qu'envoie le téléphone ne fixe le
// débit. Le cadeau créé suit le cycle coupon existant (ADR 0011).
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  const itemId = body?.itemId;
  if (typeof restaurantId !== "string" || !restaurantId || typeof itemId !== "string" || !itemId) {
    return NextResponse.json({ error: "restaurantId et itemId requis." }, { status: 400 });
  }
  // itemId doit être un UUID — sinon le RPC lève « invalid input syntax for
  // type uuid » (500). Message neutre (ADR 0007).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
    return NextResponse.json({ error: "Ce cadeau n'est plus disponible." }, { status: 400 });
  }

  try {
    const result = await exchangeCatalogueItem(user.id, restaurantId, itemId);
    if ("error" in result) {
      // Messages neutres — jamais de coûts ni de vraie mécanique (ADR 0007).
      switch (result.error) {
        case "insufficient_points":
          return NextResponse.json({ error: "Il te manque encore des points pour ce cadeau." }, { status: 400 });
        case "active_reward_exists":
          return NextResponse.json(
            { error: "Un cadeau t'attend déjà : récupère-le avant d'en choisir un autre." },
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
