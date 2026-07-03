import { createAdminClient } from "./supabase";
import { getAverageBasket } from "./avg-basket";
import {
  DEFAULT_BUDGET_PCT,
  jetonsGiftCostCap,
  pickBestGift,
  type GiftCandidate,
} from "./reward-sizing";

// ADR 0017 §2 — Cadeau des 4 jetons (actions sociales / parrainages).
// Aucune commande en face : coût pur, plafonné à panier_moyen × BUDGET_PCT.
// L'article vient du catalogue (restaurants.jetons_gift_menu_item_id, m28) ;
// fallback hérité tant que rien n'est configuré. Données euros : service role
// uniquement — seule le NOM de l'article sort côté membre (ADR 0007).

const BUDGET_PCT = parseFloat(process.env.REWARD_BUDGET_PCT ?? String(DEFAULT_BUDGET_PCT));

// Cadeau hérité Belchicken (pré-ADR 0017)
const LEGACY_GIFT = { id: null as string | null, name: "12 Churros", cost: 0.63 };

export type JetonsGift = { id: string | null; name: string; cost: number };

type RestaurantGiftRow = {
  jetons_gift_menu_item_id: string | null;
  menu_items:
    | { id: string; name: string; cost_price: number; is_active: boolean; reward_eligible: boolean }
    | { id: string; name: string; cost_price: number; is_active: boolean; reward_eligible: boolean }[]
    | null;
};

export async function getJetonsGift(restaurantId: string): Promise<JetonsGift> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("restaurants")
    .select("jetons_gift_menu_item_id, menu_items(id, name, cost_price, is_active, reward_eligible)")
    .eq("id", restaurantId)
    .maybeSingle();

  // Fail-open héritage si la colonne n'existe pas encore (m28 non appliquée)
  if (error || !data) return LEGACY_GIFT;

  const row = data as unknown as RestaurantGiftRow;
  const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items;
  if (!mi || !mi.is_active || !mi.reward_eligible) return LEGACY_GIFT;
  return { id: mi.id, name: mi.name, cost: Number(mi.cost_price) };
}

// Suggestion : sous le plafond, l'article au meilleur ratio valeur perçue /
// coût réel du catalogue. L'admin accepte ou remplace (ADR 0013 §3).
export async function suggestJetonsGift(restaurantId: string): Promise<{
  suggestion: GiftCandidate | null;
  costCap: number;
  avgBasket: number;
}> {
  const admin = createAdminClient();
  const [avgBasket, { data: items }] = await Promise.all([
    getAverageBasket(restaurantId),
    admin
      .from("menu_items")
      .select("id, name, menu_price, cost_price")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .eq("reward_eligible", true),
  ]);

  const costCap = jetonsGiftCostCap(avgBasket, BUDGET_PCT);
  const candidates: GiftCandidate[] = ((items ?? []) as GiftCandidate[]).map((i) => ({
    id: i.id,
    name: i.name,
    menu_price: Number(i.menu_price),
    cost_price: Number(i.cost_price),
  }));

  return { suggestion: pickBestGift(candidates, costCap), costCap, avgBasket };
}

export { BUDGET_PCT as JETONS_BUDGET_PCT };
