"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { generateRestaurantSlug, isRestaurantOwner } from "@/lib/restaurant";
import { parseMenuCsv, upsertMenuCatalog } from "@/lib/menu";

// ADR 0015 §6-7 — un membre connecté crée son établissement lui-même et en
// devient l'admin (owner_id). Reste invisible (status 'pending') jusqu'à
// validation manuelle par le super-admin plateforme (/platform).
export async function createPartnerRestaurant(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const name = (formData.get("name") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const cuisineTypes = formData.getAll("cuisine_types").map((v) => String(v).trim()).filter(Boolean);
  const googleMapsUrl = (formData.get("google_maps_url") as string)?.trim() || null;
  const instagramUrl = (formData.get("instagram_url") as string)?.trim() || null;
  const tiktokUrl = (formData.get("tiktok_url") as string)?.trim() || null;
  const facebookUrl = (formData.get("facebook_url") as string)?.trim() || null;

  if (!name || name.length < 2) {
    return { error: "Entre le nom de ton restaurant." };
  }
  if (cuisineTypes.length > 5) {
    return { error: "5 types de cuisine maximum." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié. Reconnecte-toi puis réessaie." };

  const slug = await generateRestaurantSlug(name);
  const admin = createAdminClient();
  const { error } = await admin.from("restaurants").insert({
    id: slug,
    name,
    address,
    cuisine_types: cuisineTypes,
    owner_id: user.id,
    status: "pending",
    google_maps_url: googleMapsUrl,
    instagram_url: instagramUrl,
    tiktok_url: tiktokUrl,
    facebook_url: facebookUrl,
  });

  if (error) {
    return { error: "Erreur lors de la création. Réessaie." };
  }

  redirect(`/become-a-partner/${slug}/menu`);
}

// Étape 2 — catalogue menu obligatoire (ADR 0013, réutilise lib/menu.ts tel
// quel). Nécessaire pour les stratégies de bundling/promotion à venir —
// chaque rôle d'un même article (ex. accompagnement gratuit vs à la carte)
// doit être soumis comme une ligne séparée par le restaurateur.
export async function submitOnboardingMenu(
  restaurantId: string,
  _prevState: { error: string; warnings?: string[] } | null,
  formData: FormData
): Promise<{ error: string; warnings?: string[] } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié. Reconnecte-toi puis réessaie." };

  const owner = await isRestaurantOwner(user.id, restaurantId);
  if (!owner) return { error: "Tu n'es pas le propriétaire de cet établissement." };

  const csv = (formData.get("csv") as string) ?? "";
  const { items, errors } = parseMenuCsv(csv);

  if (items.length === 0) {
    return { error: "Aucun article valide trouvé dans le fichier.", warnings: errors };
  }

  await upsertMenuCatalog(restaurantId, items);

  redirect(`/r/${restaurantId}`);
}
