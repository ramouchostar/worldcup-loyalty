import type { PublicMenu } from "@/lib/site-orders/menu";

// POINT D'EXTENSION : les PROMOTIONS, entre l'en-tête et la carte. Vide pour l'instant : rien n'est rendu, pas même un
// conteneur. `OrderApp` fournit déjà l'établissement et sa carte.

export function PromotionsSlot(_props: { restaurantId: string; menu: PublicMenu }) {
  return null;
}
