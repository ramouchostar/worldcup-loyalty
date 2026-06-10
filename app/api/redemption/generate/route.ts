import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";
import { randomBytes } from "crypto";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const restaurantId = getRestaurantId();
  const admin = createAdminClient();

  const { data: reward } = await admin
    .from("pending_rewards")
    .select("id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .eq("status", "available")
    .single();

  if (!reward) {
    return NextResponse.json({ error: "Aucune récompense à récupérer" }, { status: 404 });
  }

  const token = randomBytes(9).toString("base64url"); // 12 chars URL-safe
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Marquer la récompense comme récupérée dès l'activation du coupon.
  // Le cashier valide en voyant le countdown live — pas besoin de confirmation admin.
  const [tokenInsert] = await Promise.all([
    admin.from("redemption_tokens").insert({
      user_id: user.id,
      reward_id: reward.id,
      restaurant_id: restaurantId,
      token,
      expires_at: expiresAt,
      redeemed_at: now,
    }),
    admin
      .from("pending_rewards")
      .update({ status: "redeemed", redeemed_at: now })
      .eq("id", reward.id),
  ]);

  if (tokenInsert.error) return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });

  return NextResponse.json({ token });
}
