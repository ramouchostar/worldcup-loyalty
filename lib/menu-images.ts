// Photos produits du catalogue (migration 20260912-1120).
//
// Module PUR, importable côté client : `lib/menu.ts` tire `createAdminClient`
// et ne peut pas servir dans un composant "use client". Même rôle que
// `logoPublicUrl` pour le bucket `restaurant-logos`, mais sans dépendance
// serveur.
//
// `menu_items.image_path` est TOUJOURS un chemin dans le bucket, jamais une URL
// externe : on re-héberge les photos fournies par le restaurateur (pas de
// hotlink chez un tiers, et l'image survit à un changement de CDN source).

export const MENU_IMAGE_BUCKET = "menu-images";

/** URL publique d'une photo produit à partir de son chemin de stockage. */
export function menuImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${MENU_IMAGE_BUCKET}/${path}`;
}
