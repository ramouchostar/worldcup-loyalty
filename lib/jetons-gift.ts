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

// Cadeau hérité Belchicken (pré-ADR 0017) — réservé au resto historique :
// pour tout autre établissement sans cadeau configuré, on affiche un
// « cadeau surprise » plutôt qu'un article qui n'existe pas chez lui.
const LEGACY_GIFT = { id: null as string | null, name: "12 Churros", cost: 0.63 };
const UNCONFIGURED_GIFT = { id: null as string | null, name: "Cadeau surprise", cost: 0 };
const LEGACY_RESTAURANT_ID = "kraainem";

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

  const fallback = restaurantId === LEGACY_RESTAURANT_ID ? LEGACY_GIFT : UNCONFIGURED_GIFT;

  // Fail-open héritage si la colonne n'existe pas encore (m28 non appliquée)
  if (error || !data) return fallback;

  const row = data as unknown as RestaurantGiftRow;
  const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items;
  // Coût inconnu (ADR 0046) : jamais un cadeau — Number(null)=0 tromperait le plafond.
  if (!mi || !mi.is_active || !mi.reward_eligible || mi.cost_price == null) return fallback;
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
  // Coût inconnu (ADR 0046) : exclu des candidats cadeaux.
  const candidates: GiftCandidate[] = ((items ?? []) as GiftCandidate[])
    .filter((i) => (i.cost_price as number | null) != null)
    .map((i) => ({
    id: i.id,
    name: i.name,
    menu_price: Number(i.menu_price),
    cost_price: Number(i.cost_price),
  }));

  return { suggestion: pickBestGift(candidates, costCap), costCap, avgBasket };
}

export { BUDGET_PCT as JETONS_BUDGET_PCT };

// ── Comptage budget (ADR 0012 — correctif 2026-09-02) ────────────────────────
// Le cadeau 4 jetons est un coût pur (aucune commande en face) mais n'entrait
// dans AUCUN compteur : le plafond mensuel « coût cadeaux ≤ 8 % du CA
// programme » ignorait ces cadeaux-là. À appeler juste APRÈS l'écriture qui
// vient d'accorder UN jeton (validation d'action sociale, 5e filleul) : si le
// total du membre atteint un multiple de 4, ce jeton complète un cadeau → son
// coût entre dans le mois courant. Best-effort, comme tous les incréments
// budget : un échec est loggé, jamais bloquant. Un rejet ultérieur de l'action
// ne décrémente pas — même prudence que les cadeaux expirés (jamais décomptés).
export async function recordJetonsGiftCostIfEarned(
  restaurantId: string,
  userId: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    const [claimsQ, referralsQ] = await Promise.all([
      admin
        .from("micro_reward_claims")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("user_id", userId)
        .eq("status", "validated"),
      admin
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("referrer_id", userId),
    ]);
    // Mêmes formules que les surfaces membres (lib/social-actions.ts) :
    // 1 jeton par action validée, 1 jeton par tranche de 5 filleuls.
    const tokens = (claimsQ.count ?? 0) + Math.floor((referralsQ.count ?? 0) / 5);
    if (tokens === 0 || tokens % 4 !== 0) return;

    const gift = await getJetonsGift(restaurantId);
    if (gift.cost <= 0) return; // « Cadeau surprise » non configuré : rien à compter
    const { incrementRewardsCost } = await import("./budget");
    await incrementRewardsCost(restaurantId, gift.cost);
  } catch (e) {
    console.error("[jetons-gift] recordJetonsGiftCostIfEarned failed:", (e as Error).message);
  }
}
