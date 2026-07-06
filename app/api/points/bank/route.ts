import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { bankReward } from "@/lib/points";

// POST /api/points/bank { restaurantId } — « Mettre de côté » (ADR 0021) :
// convertit le cadeau disponible du membre en points de réserve et libère
// le slot un-seul-cadeau-actif (ADR 0011). Idempotent (RPC bank_reward).
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  // Le cadeau 'available' du membre — les cadeaux échangés depuis la réserve
  // (source 'saver', order_id NULL) ne sont pas re-bankables : le RPC les
  // refuse aussi, ceinture et bretelles.
  const admin = createAdminClient();
  const { data: reward } = await admin
    .from("pending_rewards")
    .select("id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "available")
    .not("order_id", "is", null)
    .maybeSingle();

  if (!reward) {
    return NextResponse.json({ error: "Aucun cadeau à mettre de côté." }, { status: 409 });
  }

  try {
    const points = await bankReward(reward.id, user.id);
    if (points <= 0) {
      return NextResponse.json({ error: "Aucun cadeau à mettre de côté." }, { status: 409 });
    }
    return NextResponse.json({ points });
  } catch (err) {
    console.error("[points/bank] échec:", err);
    return NextResponse.json({ error: "Erreur serveur. Réessaie." }, { status: 500 });
  }
}
