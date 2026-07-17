import { createServerSupabaseClient, createAdminClient } from "./supabase";
import type { Branding } from "./branding";

const LOGO_BUCKET = "restaurant-logos";
const EMPTY_BRANDING: Branding = { logo_url: null, brand_primary: null, brand_dark: null, brand_accent: null };

// Charte graphique d'un établissement (couleurs + logo, m37). Résilient : si
// les colonnes n'existent pas encore (migration non appliquée), retourne les
// défauts Boosteats au lieu de casser la page. Voir lib/branding.ts.
export async function getRestaurantBranding(restaurantId: string): Promise<Branding> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("restaurants")
      .select("logo_url, brand_primary, brand_dark, brand_accent")
      .eq("id", restaurantId)
      .maybeSingle();
    if (error || !data) return EMPTY_BRANDING;
    return data as Branding;
  } catch {
    return EMPTY_BRANDING;
  }
}

// URL publique d'un logo à partir de son chemin de stockage (bucket public).
export function logoPublicUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}

export { LOGO_BUCKET };

// Conservé pour app/admin/** uniquement (ADR 0015 §6-7 hors scope — l'admin
// reste sur un seul établissement résolu par variable d'environnement le
// temps que le modèle admin multi-établissement soit conçu). Le code membre
// résout le restaurant via le segment d'URL /r/[restaurantId], voir
// getRestaurant() ci-dessous.
export function getRestaurantId(): string {
  // Fallback = resto historique réel (kraainem) : "molenbeek" ne correspondait
  // à aucun établissement en base et cassait l'accès admin legacy (is_admin)
  // quand la variable d'env manquait.
  return process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "kraainem";
}

export type RestaurantInfo = {
  id: string;
  name: string;
  status: "pending" | "active" | "disabled";
  address: string | null;
  cuisine_types: string[];
  google_maps_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
};

// Résout un établissement à partir du segment d'URL /r/[restaurantId] —
// null si l'id ne correspond à aucun restaurant (le layout appelant décide
// du 404/redirect). Reste neutre sur le statut : c'est à l'appelant de
// décider quoi faire d'un établissement pending/disabled (owner vs visiteur).
export async function getRestaurant(restaurantId: string): Promise<RestaurantInfo | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("restaurants")
    .select("id, name, status, address, cuisine_types, google_maps_url, instagram_url, tiktok_url, facebook_url")
    .eq("id", restaurantId)
    .single();
  return data;
}

// Nom d'affichage d'un établissement (titre des pushs, prompt OCR, messages).
// Mémoïsé par invocation serverless — les broadcasts et validations en lot
// le demandent en boucle pour le même restaurant.
const displayNameCache = new Map<string, string>();
export async function getRestaurantDisplayName(restaurantId: string): Promise<string> {
  const cached = displayNameCache.get(restaurantId);
  if (cached) return cached;
  const admin = createAdminClient();
  const { data } = await admin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
  const name = data?.name ?? "Ton restaurant";
  displayNameCache.set(restaurantId, name);
  return name;
}

// ADR 0015 §7 — admin établissement = celui qui l'a créé (owner_id), sur le
// modèle "capitaine" déjà utilisé pour les équipes (lib/teams.ts).
export async function isRestaurantOwner(userId: string, restaurantId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("restaurants")
    .select("owner_id")
    .eq("id", restaurantId)
    .maybeSingle();
  return data?.owner_id === userId;
}

// Slug URL-safe pour le self-service (id texte de `restaurants`) — dérivé du
// nom, avec repli en cas de collision. Même logique de retry que
// randomCode() dans lib/teams.ts pour les join_code d'équipe.
export async function generateRestaurantSlug(name: string): Promise<string> {
  const admin = createAdminClient();
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "restaurant";

  let slug = base;
  for (let i = 0; i < 20; i++) {
    const { data } = await admin.from("restaurants").select("id").eq("id", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i + 2}`;
  }
  throw new Error("Impossible de générer un identifiant unique pour ce restaurant.");
}
