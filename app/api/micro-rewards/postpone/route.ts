import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { MicroRewardType } from "@/types";

const VALID_TYPES: MicroRewardType[] = [
  "google_review",
  "instagram_follow",
  "tiktok_follow",
  "facebook_follow",
];

// Report serveur d'une mission ("Je le ferai plus tard", Carte Actions) —
// permet le rappel à 7 jours (ADR 0024, lib/member-strategies.ts). Le
// réaffichage à 24h reste géré côté client (localStorage), indépendant de
// cette trace serveur.
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const { reward_type, restaurantId } = body;

  if (!reward_type || !VALID_TYPES.includes(reward_type as MicroRewardType)) {
    return NextResponse.json({ error: "Type d'action invalide." }, { status: 400 });
  }
  // F6 (sécurité) — même contrainte de format que /api/micro-rewards.
  if (!restaurantId || !/^[a-z0-9-]{1,40}$/.test(restaurantId)) {
    return NextResponse.json({ error: "restaurantId invalide." }, { status: 400 });
  }

  const { error } = await supabase.from("micro_reward_postpones").upsert(
    {
      user_id: user.id,
      restaurant_id: restaurantId,
      reward_type,
      postponed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,restaurant_id,reward_type" }
  );
  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });

  return NextResponse.json({ success: true });
}
