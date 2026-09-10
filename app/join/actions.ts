"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { sendReferralSuccessEmail } from "@/lib/email";
import { attributeStaffSignup } from "@/lib/staff-codes";

// ADR 0015 §3 — adhésion à un établissement = libre, pas d'invitation requise.
// Adhésion + attribution du parrainage, SANS redirection finale — réutilisée
// par l'écran de scan visiteur (ADR 0040) où la suite est la reprise du
// ticket, pas le dashboard.
export async function ensureMembership(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  // ADR 0053 — l'attribution au personnel ne vaut que pour une adhésion
  // NOUVELLE : un membre déjà inscrit qui rescanne le QR d'un serveur ne doit
  // pas devenir sa recrue.
  const { data: existingMembership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  const isNewMembership = !existingMembership;

  await admin
    .from("memberships")
    .upsert(
      { user_id: user.id, restaurant_id: restaurantId },
      { onConflict: "user_id,restaurant_id", ignoreDuplicates: true }
    );

  // Attribution du parrainage (déplacée depuis register/actions.ts — le
  // restaurant n'est connu qu'à cette étape désormais, ADR 0015).
  const cookieStore = await cookies();
  // ADR 0053 §3 — le parrainage membre PRIME sur le code salle quand les deux
  // cookies sont présents (il coûte des jetons et engage deux personnes).
  let referralCredited = false;
  const refCode = cookieStore.get("belchicken_ref")?.value;
  if (refCode && /^[A-Z0-9]{6}$/.test(refCode)) {
    const { data: refLink } = await admin
      .from("referral_links")
      .select("user_id")
      .eq("code", refCode)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (refLink && refLink.user_id !== user.id) {
      const { error: refError } = await admin.from("referrals").insert({
        referrer_id: refLink.user_id,
        referee_id: user.id,
        restaurant_id: restaurantId,
      });
      if (!refError) referralCredited = true;

      // ADR 0012 — un 5e filleul accorde un jeton, qui peut compléter un
      // cadeau 4 jetons : son coût entre alors dans le budget du mois.
      // Uniquement sur insertion réussie (un doublon UNIQUE(referee_id) ne
      // crédite rien). Best-effort, jamais bloquant.
      if (!refError) {
        const { count: refCount } = await admin
          .from("referrals")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("referrer_id", refLink.user_id);
        if ((refCount ?? 0) > 0 && (refCount ?? 0) % 5 === 0) {
          const { recordJetonsGiftCostIfEarned } = await import("@/lib/jetons-gift");
          await recordJetonsGiftCostIfEarned(restaurantId, refLink.user_id);
        }
      }

      const { data: referrer } = await admin
        .from("profiles")
        .select("email, display_name")
        .eq("id", refLink.user_id)
        .single();
      const { data: updatedLink } = await admin
        .from("referral_links")
        .select("conversions")
        .eq("user_id", refLink.user_id)
        .eq("restaurant_id", restaurantId)
        .single();
      if (referrer?.email && updatedLink) {
        await sendReferralSuccessEmail(
          referrer.email,
          refLink.user_id,
          referrer.display_name ?? "toi",
          restaurantId,
          updatedLink.conversions
        );
      }
    }

    cookieStore.set("belchicken_ref", "", { maxAge: 0, path: "/" });
  }

  // ADR 0053 — attribution au personnel en salle : adhésion NOUVELLE
  // uniquement, et seulement si aucun parrainage membre n'a été crédité.
  const staffCode = cookieStore.get("staff_ref")?.value;
  if (staffCode && /^[A-Z0-9]{6}$/.test(staffCode)) {
    if (isNewMembership && !referralCredited) {
      await attributeStaffSignup(restaurantId, user.id, staffCode);
    }
    cookieStore.set("staff_ref", "", { maxAge: 0, path: "/" });
  }
}

export async function joinRestaurant(restaurantId: string) {
  await ensureMembership(restaurantId);
  // ADR 0018 — l'équipe est optionnelle : on ouvre sur le dashboard (aperçu
  // de la valeur), qui propose lui-même de rejoindre une équipe.
  redirect(`/r/${restaurantId}/dashboard`);
}
