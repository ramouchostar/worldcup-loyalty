import { createServerSupabaseClient } from "@/lib/supabase";
import { ensureMembership } from "@/app/join/actions";
import { getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import SubmitOrderClient from "@/components/member/SubmitOrderClient";

// ADR 0040 — le scan est ouvert aux visiteurs : la photo d'abord, le compte au
// moment de l'envoi (« garde tes points »). Un connecté non-membre qui ouvre
// cet écran veut soumettre un ticket ICI → adhésion automatique (adhésion
// libre, ADR 0015 §3) — sinon /api/orders répondrait 403 au moment de l'envoi.
export default async function SubmitOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ resume?: string }>;
}) {
  const { restaurantId } = await params;
  const { resume } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (!membership) await ensureMembership(restaurantId);
  }

  // Même logo qu'en tête de la landing (ADR 0042/0043) — cohérence visuelle
  // du parcours visiteur d'un écran à l'autre.
  const branding = await getRestaurantBranding(restaurantId);
  const logoUrl = logoPublicUrl(branding.logo_url);

  return <SubmitOrderClient visitor={!user} resume={resume === "1"} logoUrl={logoUrl} />;
}
