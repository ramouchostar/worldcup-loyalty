"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { isValidHex } from "@/lib/branding";
import { LOGO_BUCKET } from "@/lib/restaurant";

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

// Charte graphique (m37) : logo + 3 couleurs. L'app s'adapte à ces couleurs
// sur les surfaces membre et admin de l'établissement (lib/branding.ts).
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function updateRestaurantBranding(
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

  // Couleurs : champ absent → on ne touche pas ; vide → null (retour au défaut
  // Boosteats) ; hex #RRGGBB → valeur ; sinon → erreur.
  const admin = createAdminClient();
  const update: Record<string, string | null> = {};
  const colorFields: { field: string; label: string }[] = [
    { field: "brand_primary", label: "principale" },
    { field: "brand_dark", label: "foncée" },
    { field: "brand_accent", label: "accent" },
  ];
  for (const { field, label } of colorFields) {
    const raw = formData.get(field);
    if (raw === null) continue; // champ absent
    const v = String(raw).trim();
    if (!v) { update[field] = null; continue; }
    if (!isValidHex(v)) return { error: `La couleur ${label} doit être au format hexadécimal (ex. #C8102E).` };
    update[field] = v.toUpperCase();
  }

  // Logo : upload si fourni, suppression si demandée.
  const logo = formData.get("logo");
  const removeLogo = formData.get("remove_logo") === "true";
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_TYPES[logo.type];
    if (!ext) return { error: "Logo : formats acceptés PNG, JPG, WebP ou SVG." };
    if (logo.size > 2 * 1024 * 1024) return { error: "Logo : 2 Mo maximum." };
    const path = `${restaurantId}/logo-${Date.now()}.${ext}`;
    const bytes = await logo.arrayBuffer();
    const { error: upErr } = await admin.storage
      .from(LOGO_BUCKET)
      .upload(path, bytes, { contentType: logo.type, upsert: true });
    if (upErr) return { error: "Erreur lors de l'upload du logo. Réessaie." };
    update.logo_url = path;
  } else if (removeLogo) {
    update.logo_url = null;
  }

  if (Object.keys(update).length === 0) {
    return { success: "Aucun changement." };
  }

  const { error } = await admin.from("restaurants").update(update).eq("id", restaurantId);
  if (error) {
    // Colonnes absentes = migration m37 pas encore exécutée.
    if (/column .* does not exist|brand_|logo_url/i.test(error.message)) {
      return { error: "La charte graphique n'est pas encore activée (migration m37 à exécuter côté base)." };
    }
    return { error: "Erreur lors de l'enregistrement. Réessaie." };
  }

  revalidatePath(`/admin/${restaurantId}`, "layout");
  revalidatePath(`/r/${restaurantId}`, "layout");
  return { success: "Charte graphique enregistrée." };
}
