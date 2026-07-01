"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;

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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "Email ou mot de passe incorrect." };
  }

  // Arrivée via le QR code / lien d'un établissement précis (page /r/[id])
  // → on y retourne en priorité, peu importe les adhésions existantes.
  const pendingRestaurantId = cookieStore.get("pending_restaurant_id")?.value;
  if (pendingRestaurantId) {
    cookieStore.set("pending_restaurant_id", "", { maxAge: 0, path: "/" });
    redirect(`/r/${pendingRestaurantId}`);
  }

  // ADR 0015 §2 — un membre peut avoir plusieurs établissements ; on ouvre
  // sur le dernier rejoint. Aucune adhésion → direction /register (ou /join
  // si le profil a déjà un nom, cf. registerProfile()).
  const { data: membership } = await supabase
    .from("memberships")
    .select("restaurant_id")
    .eq("user_id", data.user.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  redirect(membership ? `/r/${membership.restaurant_id}/dashboard` : "/register");
}
