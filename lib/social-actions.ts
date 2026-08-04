import type { MicroRewardType } from "@/types";

// Resto historique (pré-ADR 0015) : ses liens sociaux peuvent encore venir
// des variables d'env globales. Tout autre établissement n'utilise QUE ses
// propres colonnes — sinon un membre gagnerait un jeton en suivant les
// réseaux d'un autre resto.
const LEGACY_RESTAURANT_ID = "kraainem";

export const ACTION_ICONS: Record<MicroRewardType, string> = {
  google_review: "⭐",
  instagram_follow: "📸",
  tiktok_follow: "🎵",
  facebook_follow: "👍",
};

// Libellé du bouton vert selon l'action (jamais "automatique"/"instantané", ADR 0008)
export const ACTION_BUTTON_LABELS: Record<MicroRewardType, string> = {
  google_review: "Donner mon avis",
  instagram_follow: "Suivre",
  tiktok_follow: "Suivre",
  facebook_follow: "Suivre",
};

// Ordre d'affichage de la Carte Actions (la carte séquentielle du dashboard) —
// les abonnements réseaux d'abord, l'avis Google (plus d'effort) en dernier.
export const ACTION_ORDER: MicroRewardType[] = [
  "instagram_follow",
  "tiktok_follow",
  "facebook_follow",
  "google_review",
];

type RestaurantSocialLinks = {
  google_maps_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
};

export function getActionLinks(
  restaurant: RestaurantSocialLinks,
  restaurantId: string
): Record<MicroRewardType, string | undefined> {
  const legacyFallback = (envUrl: string | undefined) =>
    restaurantId === LEGACY_RESTAURANT_ID ? envUrl : undefined;

  return {
    google_review: restaurant.google_maps_url ?? legacyFallback(process.env.NEXT_PUBLIC_GOOGLE_MAPS_URL),
    instagram_follow: restaurant.instagram_url ?? legacyFallback(process.env.NEXT_PUBLIC_INSTAGRAM_URL),
    tiktok_follow: restaurant.tiktok_url ?? legacyFallback(process.env.NEXT_PUBLIC_TIKTOK_URL),
    facebook_follow: restaurant.facebook_url ?? legacyFallback(process.env.NEXT_PUBLIC_FACEBOOK_URL),
  };
}
