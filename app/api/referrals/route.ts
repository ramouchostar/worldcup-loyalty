import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getOrCreateReferralLink } from "@/lib/referral-code";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const admin = createAdminClient();

  // Récupère ou crée le lien de parrainage du membre
  const link = await getOrCreateReferralLink(admin, user.id, restaurantId);
  if (!link) {
    return NextResponse.json({ error: "Erreur lors de la création du lien." }, { status: 500 });
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
