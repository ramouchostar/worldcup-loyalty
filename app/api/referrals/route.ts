import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // pas de 0/O, 1/I/L

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const admin = createAdminClient();

  // Récupère ou crée le lien de parrainage du membre
  let { data: link } = await admin
    .from("referral_links")
    .select("code, conversions")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!link) {
    let code = generateCode();
    let attempts = 0;

    while (attempts < 5) {
      const { data, error } = await admin
        .from("referral_links")
        .insert({ user_id: user.id, restaurant_id: restaurantId, code })
        .select("code, conversions")
        .single();

      if (!error) {
        link = data;
        break;
      }
      // Collision sur le code (rare) — retenter avec un nouveau code
      code = generateCode();
      attempts++;
    }

    if (!link) {
      return NextResponse.json({ error: "Erreur lors de la création du lien." }, { status: 500 });
    }
  }

  // Parrainages validés (amis inscrits via le lien)
  const { data: referrals } = await admin
    .from("referrals")
    .select("id, referred_at")
    .eq("referrer_id", user.id)
    .eq("restaurant_id", restaurantId)
    .order("referred_at", { ascending: false });

  const list = referrals ?? [];

  return NextResponse.json({
    code: link.code,
    conversions: link.conversions,
    referrals: list,
    validatedCount: list.length,
  });
}
