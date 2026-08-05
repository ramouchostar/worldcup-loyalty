"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePostLoginDestination } from "@/lib/post-login";

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
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
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

  // ADR 0030 §1 — destination par rôle (plateforme > console > membre),
  // `as=resto` (Espace restaurateur) force la console.
  redirect(await resolvePostLoginDestination(data.user.id, { as: formData.get("as") as string | null }));
}
