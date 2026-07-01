"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";

// ADR 0015 §3 — adhésion à un établissement = libre, pas d'invitation requise.
export async function joinRestaurant(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  await admin
    .from("memberships")
    .upsert(
      { user_id: user.id, restaurant_id: restaurantId },
      { onConflict: "user_id,restaurant_id", ignoreDuplicates: true }
    );

  // Attribution du parrainage (déplacée depuis register/actions.ts — le
  // restaurant n'est connu qu'à cette étape désormais, ADR 0015).
  const cookieStore = await cookies();
  const refCode = cookieStore.get("belchicken_ref")?.value;
  if (refCode && /^[A-Z0-9]{6}$/.test(refCode)) {
    const { data: refLink } = await admin
      .from("referral_links")
      .select("user_id")
      .eq("code", refCode)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (refLink && refLink.user_id !== user.id) {
      await admin.from("referrals").insert({
        referrer_id: refLink.user_id,
        referee_id: user.id,
        restaurant_id: restaurantId,
      });
    }

    cookieStore.set("belchicken_ref", "", { maxAge: 0, path: "/" });
  }

  redirect(`/r/${restaurantId}/my-team`);
}
