import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";

// L'écran compte vit désormais sous le layout membre :
// /r/[restaurantId]/compte (audit UX 2026-08-11, constat M9 nav). Cette URL
// reste vivante (liens existants, emails) et redirige vers l'établissement du
// membre ; sans adhésion → /join.
export default async function ComptePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=login-required");

  const { data: membership } = await supabase
    .from("memberships")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.restaurant_id) redirect("/join");
  redirect(`/r/${membership.restaurant_id}/compte`);
}
