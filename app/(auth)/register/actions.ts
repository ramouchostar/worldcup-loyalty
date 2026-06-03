"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";

export async function registerTeam(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const teamId = formData.get("team_id") as string;
  const displayName = (formData.get("display_name") as string).trim();

  if (!teamId || !displayName) {
    return { error: "Choisis une équipe et entre ton prénom." };
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {}
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return { error: "Non authentifié. Reconnecte-toi puis réessaie." };
  }

  const user = session.user;
  const restaurantId = process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "molenbeek";

  const { data: updatedRows, error } = await supabase
    .from("profiles")
    .update({
      team_id: teamId,
      display_name: displayName,
      restaurant_id: restaurantId,
    })
    .eq("id", user.id)
    .select();

  if (error) {
    return { error: "Erreur lors de l'enregistrement. Réessaie." };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Profil introuvable. Déconnecte-toi et reconnecte-toi." };
  }

  // Attribution du parrainage si le membre est arrivé via un lien /join?ref=CODE
  const refCode = cookieStore.get("belchicken_ref")?.value;
  if (refCode && /^[A-Z0-9]{6}$/.test(refCode)) {
    const admin = createAdminClient();

    const { data: refLink } = await admin
      .from("referral_links")
      .select("user_id")
      .eq("code", refCode)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    // Le parrain existe et ce n'est pas le membre lui-même
    if (refLink && refLink.user_id !== user.id) {
      await admin.from("referrals").insert({
        referrer_id: refLink.user_id,
        referee_id: user.id,
        restaurant_id: restaurantId,
      });
    }

    // Effacer le cookie — attribution one-shot
    cookieStore.set("belchicken_ref", "", { maxAge: 0, path: "/" });
  }

  redirect("/dashboard");
}
