import { createAdminClient } from "./supabase";
import { getMenuItems } from "./menu";
import { getAverageBasket } from "./avg-basket";
import { COMMUNITY_BANDS } from "./reward-bands";
import {
  DEFAULT_BUDGET_PCT,
  jetonsGiftCostCap,
  pickBestGift,
  pickGenerousGift,
  soloCostCap,
  suggestSoloBands,
  suggestSaverBands,
  type GiftCandidate,
} from "./reward-sizing";

// ADR 0017 §4 — configuration par défaut à l'onboarding. Dès que le catalogue
// est soumis, l'app calcule une grille protégée (paliers dimensionnés, articles
// sous plafond, cadeau jetons plafonné) au lieu de laisser le resto retomber
// sur la grille héritée Belchicken. Déterministe (aucun appel IA) et
// non-destructif : ne touche jamais une configuration existante — le
// restaurateur révise et ajuste ensuite depuis /admin/menu.

const BUDGET_PCT = parseFloat(process.env.REWARD_BUDGET_PCT ?? String(DEFAULT_BUDGET_PCT));

export type DefaultConfigResult = {
  soloConfigured: boolean;
  communityConfigured: boolean;
  jetonsConfigured: boolean;
  saverConfigured: boolean;
};

export async function applyDefaultRewardConfig(restaurantId: string): Promise<DefaultConfigResult> {
  const result: DefaultConfigResult = {
    soloConfigured: false,
    communityConfigured: false,
    jetonsConfigured: false,
    saverConfigured: false,
  };

  const items = (await getMenuItems(restaurantId)).filter((i) => i.is_active && i.reward_eligible);
  if (items.length === 0) return result;

  // Coût inconnu (ADR 0046) : exclu des candidats cadeaux.
  const candidates: GiftCandidate[] = items.filter((i) => (i.cost_price as number | null) != null).map((i) => ({
    id: i.id,
    name: i.name,
    menu_price: Number(i.menu_price),
    cost_price: Number(i.cost_price),
  }));
  const costs = candidates.map((c) => c.cost_price).filter((c) => c > 0);
  const cheapestCost = costs.length > 0 ? Math.min(...costs) : 0;

  const avgBasket = await getAverageBasket(restaurantId);
  const soloBands = suggestSoloBands(avgBasket, cheapestCost, BUDGET_PCT);

  const admin = createAdminClient();

  // Non-destructif : une couche déjà configurée n'est jamais écrasée
  const { data: existing } = await admin
    .from("reward_tiers")
    .select("layer")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  const configuredLayers = new Set((existing ?? []).map((r: { layer: string }) => r.layer));

  // Premier palier : petit coût / fort ratio ; paliers suivants : l'article le
  // plus généreux que le plafond du palier autorise (progression naturelle).
  const giftForBand = (cap: number, isFirst: boolean) =>
    isFirst ? pickBestGift(candidates, cap) : pickGenerousGift(candidates, cap);

  const rows: { restaurant_id: string; layer: string; min_threshold: number; menu_item_id: string | null; is_active: boolean }[] = [];

  if (!configuredLayers.has("solo")) {
    soloBands.forEach((band, i) => {
      const gift = giftForBand(soloCostCap(band, BUDGET_PCT), i === 0);
      rows.push({
        restaurant_id: restaurantId,
        layer: "solo",
        min_threshold: band,
        menu_item_id: gift?.id ?? null,
        is_active: true,
      });
    });
    result.soloConfigured = true;
  }

  if (!configuredLayers.has("community")) {
    // Le bonus communautaire accompagne une commande comme la couche solo :
    // on reprend la même progression de plafonds (la couverture ADR 0017
    // protège de toute façon la distribution à la résolution).
    [...COMMUNITY_BANDS].forEach((score, i) => {
      const capBand = soloBands[Math.min(i, soloBands.length - 1)];
      const gift = giftForBand(soloCostCap(capBand, BUDGET_PCT), i === 0);
      rows.push({
        restaurant_id: restaurantId,
        layer: "community",
        min_threshold: score,
        menu_item_id: gift?.id ?? null,
        is_active: true,
      });
    });
    result.communityConfigured = true;
  }

  // Paliers de la réserve (ADR 0021) : gros cadeaux contre points cumulés.
  // 1 pt = 1 € dépensé → le plafond soloCostCap s'applique tel quel, et le
  // palier élevé mérite l'article le plus généreux que son plafond autorise.
  if (!configuredLayers.has("saver")) {
    suggestSaverBands(avgBasket).forEach((band) => {
      const gift = pickGenerousGift(candidates, soloCostCap(band, BUDGET_PCT));
      rows.push({
        restaurant_id: restaurantId,
        layer: "saver",
        min_threshold: band,
        menu_item_id: gift?.id ?? null,
        is_active: true,
      });
    });
    result.saverConfigured = true;
  }

  if (rows.length > 0) {
    const { error } = await admin
      .from("reward_tiers")
      .upsert(rows, { onConflict: "restaurant_id,layer,min_threshold" });
    if (error) {
      // Best-effort : l'onboarding ne doit pas échouer pour la grille par
      // défaut — le restaurateur peut toujours configurer depuis /admin/menu
      console.error("[reward-defaults] upsert reward_tiers failed:", error.message);
      result.soloConfigured = false;
      result.communityConfigured = false;
      result.saverConfigured = false;
    }
  }

  // Cadeau des 4 jetons : uniquement si rien n'est configuré (m28)
  const { data: resto } = await admin
    .from("restaurants")
    .select("jetons_gift_menu_item_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (resto && !resto.jetons_gift_menu_item_id) {
    const gift = pickBestGift(candidates, jetonsGiftCostCap(avgBasket, BUDGET_PCT));
    if (gift) {
      const { error } = await admin
        .from("restaurants")
        .update({ jetons_gift_menu_item_id: gift.id })
        .eq("id", restaurantId);
      if (!error) result.jetonsConfigured = true;
      else console.error("[reward-defaults] update jetons gift failed:", error.message);
    }
  }

  return result;
}
