"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sanitizeZones } from "@/lib/zones";

// ADR 0015 — le choix de l'établissement ne se fait plus ici (liste figée de
// 3 Belchicken) mais sur /join, qui liste les établissements réels de la
// table `restaurants` — un membre peut en rejoindre plusieurs, pas un seul
// choisi une fois pour toutes.
export async function registerProfile(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const displayName = (formData.get("display_name") as string).trim();

  if (!displayName) {
    return { error: "Entre ton prénom." };
  }

  // ADR 0018 — zones du membre (1 à 3), base de la découverte d'équipes
  const zones = sanitizeZones(formData.getAll("zones"));
  if (zones.length === 0) {
    return { error: "Indique au moins ta zone (ville ou quartier où tu vis)." };
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
    .update({ display_name: displayName, zones })
    .eq("id", user.id)
    .select();

  if (error) {
    return { error: "Erreur lors de l'enregistrement. Réessaie." };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Profil introuvable. Déconnecte-toi et reconnecte-toi." };
  }

  // Arrivée via le QR code / lien d'un établissement précis (page /r/[id])
  // → on y retourne pour qu'il clique "Rejoindre" (confirmation explicite).
  const pendingRestaurantId = cookieStore.get("pending_restaurant_id")?.value;
  if (pendingRestaurantId) {
    cookieStore.set("pending_restaurant_id", "", { maxAge: 0, path: "/" });
    redirect(`/r/${pendingRestaurantId}`);
  }

  // Le cookie belchicken_ref (parrainage) et le choix de l'établissement
  // sont désormais gérés sur /join (ADR 0015) — pas de restaurant_id connu ici.
  redirect("/join");
}
