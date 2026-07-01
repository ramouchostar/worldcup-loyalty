import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { MicroRewardType } from "@/types";

const VALID_TYPES: MicroRewardType[] = [
  "google_review",
  "instagram_follow",
  "tiktok_follow",
  "facebook_follow",
];

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const [{ data: rewards }, { data: claims }] = await Promise.all([
    supabase
      .from("micro_rewards")
      .select("*")
      .eq("is_active", true)
      .or(`restaurant_id.eq.${restaurantId},restaurant_id.is.null`),
    supabase
      .from("micro_reward_claims")
      .select("id, reward_type, proof_url, status, claimed_at")
      .eq("user_id", user.id),
  ]);

  return NextResponse.json({ rewards: rewards ?? [], claims: claims ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json();
  const { reward_type, restaurantId } = body;

  if (!reward_type || !VALID_TYPES.includes(reward_type as MicroRewardType)) {
    return NextResponse.json({ error: "Type d'action invalide." }, { status: 400 });
  }
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const { error } = await supabase.from("micro_reward_claims").insert({
    user_id: user.id,
    reward_type,
    status: "pending",
    restaurant_id: restaurantId,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Tu as déjà soumis une demande pour cette action." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
