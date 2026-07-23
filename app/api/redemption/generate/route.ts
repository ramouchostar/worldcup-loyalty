import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

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

  // ADR sécurité F4 — anti double-coupon. Compare-and-swap ATOMIQUE : la
  // récompense passe 'redeemed' UNIQUEMENT si elle est encore 'available'
  // (UPDATE ... WHERE status='available' est atomique au niveau ligne). PUIS
  // on insère le token. Deux requêtes concurrentes (double-clic, 2 onglets,
  // script) : une seule gagne le CAS, l'autre reçoit 409 → jamais deux coupons
  // valides pour une même récompense. Remplace l'ancien Promise.all non atomique.
  const { data: claimed } = await admin
    .from("pending_rewards")
    .update({ status: "redeemed", redeemed_at: now })
    .eq("id", reward.id)
    .eq("status", "available")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "Récompense déjà en cours de récupération." }, { status: 409 });
  }

  const { error: tokenError } = await admin.from("redemption_tokens").insert({
    user_id: user.id,
    reward_id: reward.id,
    restaurant_id: restaurantId,
    token,
    expires_at: expiresAt,
    redeemed_at: now,
  });

  if (tokenError) return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });

  return NextResponse.json({ token });
}
