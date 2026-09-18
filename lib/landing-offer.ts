import { createAdminClient } from "./supabase";
import { loadRewardGrid, welcomeReward } from "./rewards";
import { listCatalogue } from "./points";
import { getAverageBasket } from "./avg-basket";
import { landingShowcase, personalPointsForOrder, type CatalogueItem } from "./catalogue";

// ============================================================
// Ce que la vitrine publique promet (ADR 0062, remplace les ADR 0042/0043).
//
// Depuis l'ADR 0061, un ticket ne déclenche plus de cadeau par couche : la
// vitrine n'a plus à tirer au hasard un article « de la bonne tranche ». Elle
// dit ce qui est VRAI pour tout nouveau client :
//   1. le cadeau d'accueil de son premier ticket (premier palier solo — aucun
//      verrou ne s'y applique, seul le ticket doit être accepté) ;
//   2. des points à chaque ticket, et trois articles du catalogue avec leur
//      prix en points (repères ≈ 1, 3 et 6 tickets moyens) ;
//   3. des cadeaux d'équipe, là où l'établissement a des paliers d'équipe.
// Jamais d'euros ni de taux de points (ADR 0007, ADR 0061 §1). Le panier
// moyen sert à choisir les repères côté serveur ; il ne sort pas.
// ============================================================

export type LandingOffer = {
  welcome: { name: string; imagePath: string | null } | null;
  showcase: CatalogueItem[];
  hasTeamGifts: boolean;
};

export async function getLandingOffer(restaurantId: string): Promise<LandingOffer> {
  try {
    const [grid, catalogue, avgBasket] = await Promise.all([
      loadRewardGrid(restaurantId),
      listCatalogue(restaurantId),
      getAverageBasket(restaurantId).catch(() => 0),
    ]);

    const welcomeItem = welcomeReward(grid).item;
    let welcome: LandingOffer["welcome"] = null;
    if (welcomeItem) {
      const fromCatalogue = catalogue.find((i) => i.name === welcomeItem);
      let imagePath = fromCatalogue?.imagePath ?? null;
      if (!fromCatalogue) {
        const { data } = await createAdminClient()
          .from("menu_items")
          .select("image_path")
          .eq("restaurant_id", restaurantId)
          .eq("name", welcomeItem)
          .limit(1)
          .maybeSingle();
        imagePath = (data as { image_path: string | null } | null)?.image_path ?? null;
      }
      welcome = { name: welcomeItem, imagePath };
    }

    return {
      welcome,
      showcase: landingShowcase(catalogue, personalPointsForOrder(avgBasket)),
      hasTeamGifts: grid.community.length > 0,
    };
  } catch (err) {
    // Best-effort (comme recordLanding, ADR 0037) : la vitrine ne tombe
    // jamais pour cet aperçu — au pire, la carte reste vide.
    console.error("[landing-offer] indisponible:", err);
    return { welcome: null, showcase: [], hasTeamGifts: false };
  }
}
