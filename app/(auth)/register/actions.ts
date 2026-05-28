"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

  const { data: updatedRows, error } = await supabase
    .from("profiles")
    .update({
      team_id: teamId,
      display_name: displayName,
      restaurant_id: process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "molenbeek",
    })
    .eq("id", user.id)
    .select();

  if (error) {
    return { error: "Erreur lors de l'enregistrement. Réessaie." };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Profil introuvable. Déconnecte-toi et reconnecte-toi." };
  }

  redirect("/dashboard");
}
