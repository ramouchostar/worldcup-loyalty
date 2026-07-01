import { createServerSupabaseClient } from "./supabase";

// Conservé pour app/admin/** uniquement (ADR 0015 §6-7 hors scope — l'admin
// reste sur un seul établissement résolu par variable d'environnement le
// temps que le modèle admin multi-établissement soit conçu). Le code membre
// résout le restaurant via le segment d'URL /r/[restaurantId], voir
// getRestaurant() ci-dessous.
export function getRestaurantId(): string {
  return process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "molenbeek";
}

export type RestaurantInfo = {
  id: string;
  name: string;
  google_maps_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
};

// Résout un établissement à partir du segment d'URL /r/[restaurantId] —
// null si l'id ne correspond à aucun restaurant (le layout appelant décide
// du 404/redirect).
export async function getRestaurant(restaurantId: string): Promise<RestaurantInfo | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("restaurants")
    .select("id, name, google_maps_url, instagram_url, tiktok_url, facebook_url")
    .eq("id", restaurantId)
    .single();
  return data;
}
