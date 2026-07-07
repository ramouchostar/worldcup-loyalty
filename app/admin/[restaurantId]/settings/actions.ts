"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";

// Mise à jour des infos de l'établissement par son admin (owner, legacy ou
// super-admin). Le slug (id) ne change JAMAIS : il est imprimé sur les QR
// codes et présent dans toutes les données historiques.
export async function updateRestaurantInfo(
  restaurantId: string,
  _prevState: { error?: string; success?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié." };
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) {
    return { error: "Accès refusé." };
  }

  const name = (formData.get("name") as string)?.trim();
  const sector = (formData.get("sector") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const cuisineTypes = ((formData.get("cuisine_types") as string) ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);

  const url = (field: string) => {
    const v = (formData.get(field) as string)?.trim();
    if (!v) return null;
    try {
      const parsed = new URL(v);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
      return v;
    } catch {
      return null;
    }
  };

  if (!name || name.length < 2) return { error: "Le nom est requis." };
  // ADR 0016 §2 — le secteur alimente la page publique /secteurs
  if (!sector || sector.length < 2) return { error: "Le secteur (ville/quartier) est requis." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("restaurants")
    .update({
      name,
      sector,
      address,
      cuisine_types: cuisineTypes,
      google_maps_url: url("google_maps_url"),
      instagram_url: url("instagram_url"),
      tiktok_url: url("tiktok_url"),
      facebook_url: url("facebook_url"),
    })
    .eq("id", restaurantId);

  if (error) return { error: "Erreur lors de l'enregistrement. Réessaie." };

  revalidatePath(`/admin/${restaurantId}/settings`);
  revalidatePath(`/r/${restaurantId}`);
  return { success: "Informations enregistrées." };
}
