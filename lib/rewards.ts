import { createServerSupabaseClient, createAdminClient } from "./supabase";
import { isRestaurantThresholdUnlocked } from "./thresholds";
import { getBudgetStatus, incrementRewardsCost } from "./budget";
import type { Reward } from "@/types";
import { loadTeamTiers, resolveTeamTier } from "./team-tiers";

type TeamScoreRow = {
  score: number;
  total_spent: number;
};

// Double lock: rewards only unlock if BOTH conditions are met:
// 1. Community score exceeds the tier threshold
// 2. Restaurant revenue threshold is unlocked (is_unlocked = true)
// Family Bucket (level 5) adds a third condition: min_member_count
export async function getUnlockedRewards(
  restaurantId: string,
  teamScore: number,
  memberCount: number,
  restaurantThresholdUnlocked: boolean
): Promise<Reward[]> {
  if (!restaurantThresholdUnlocked) return [];

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("rewards")
    .select("*")
    .eq("is_active", true)
    .eq("restaurant_id", restaurantId)
    .lte("score_threshold", teamScore)
    .order("level", { ascending: true });

  return (data ?? []).filter((r: Reward) => memberCount >= r.min_member_count);
}

// Active member = at least 1 validated order
export async function isMemberActive(userId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", "validated");

  return (count ?? 0) > 0;
}

// ─── 3-layer reward calculation (ADR 0006) ───────────────────────────────────

type RewardItem = { item: string | null; cost: number };

// Layer 1 — Solo reward based on order amount. No double verrou.
export function getSoloReward(amount: number): RewardItem {
  if (amount >= 60) return { item: "Chef's Combo", cost: 1.92 };
  if (amount >= 40) return { item: "Menu 4 Tenders", cost: 1.93 };
  if (amount >= 25) return { item: "Finest burger", cost: 0.94 };
  if (amount >= 15) return { item: "Churros 6 pcs", cost: 0.31 };
  return { item: null, cost: 0 };
}

// Layer 2 — Community bonus based on team score. Requires double verrou.
export function getCommunityBonus(score: number, restaurantUnlocked: boolean): RewardItem {
  if (!restaurantUnlocked || score < 1000) return { item: null, cost: 0 };
  if (score >= 10000) return { item: "Menu 4 Tenders", cost: 1.93 };
  if (score >= 6000)  return { item: "Finest burger", cost: 0.94 };
  if (score >= 3000)  return { item: "Churros 12 pcs", cost: 0.63 };
  return { item: "Frites Medium", cost: 0.24 };
}

// Couche 3 (avancement Coupe du Monde) retirée — remplacée par les paliers
// d'équipe sur la dépense cumulée (ADR 0014, voir lib/team-tiers.ts).

// ─── Grille pilotée par le catalogue (ADR 0013) ─────────────────────────────
// Les couches solo & communautaire lisent reward_tiers + menu_items. Si aucun
// palier n'est configuré pour une couche, on retombe sur la grille héritée
// (getSoloReward / getCommunityBonus) — migration non-cassante.

type GridTier = { min: number; item: string; cost: number };
export type RewardGrid = { solo: GridTier[]; community: GridTier[] };

type MenuItemEmbed = {
  name: string;
  cost_price: number;
  is_active: boolean;
  reward_eligible: boolean;
};
type RewardTierRow = {
  layer: "solo" | "community";
  min_threshold: number;
  menu_items: MenuItemEmbed | MenuItemEmbed[] | null;
};

export async function loadRewardGrid(restaurantId: string): Promise<RewardGrid> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("reward_tiers")
    .select("layer, min_threshold, menu_items(name, cost_price, is_active, reward_eligible)")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("min_threshold", { ascending: true });

  const grid: RewardGrid = { solo: [], community: [] };
  for (const r of (data ?? []) as unknown as RewardTierRow[]) {
    const mi = Array.isArray(r.menu_items) ? r.menu_items[0] : r.menu_items;
    if (!mi || !mi.is_active || !mi.reward_eligible) continue; // article retiré/hors cadeau
    const tier: GridTier = { min: Number(r.min_threshold), item: mi.name, cost: Number(mi.cost_price) };
    (r.layer === "solo" ? grid.solo : grid.community).push(tier);
  }
  return grid;
}

// Palier le plus élevé dont le seuil est atteint (tiers triés croissants)
function pickTier(tiers: GridTier[], value: number): RewardItem {
  let best: GridTier | null = null;
  for (const t of tiers) {
    if (value >= t.min) best = t;
    else break;
  }
  return best ? { item: best.item, cost: best.cost } : { item: null, cost: 0 };
}

// Couche 1 — pilotée par catalogue, fallback grille héritée.
export function resolveSoloReward(grid: RewardGrid, amount: number): RewardItem {
  if (grid.solo.length === 0) return getSoloReward(amount);
  return pickTier(grid.solo, amount);
}

// Couche 2 — pilotée par catalogue, fallback grille héritée. Double verrou conservé.
export function resolveCommunityBonus(
  grid: RewardGrid,
  score: number,
  restaurantUnlocked: boolean
): RewardItem {
  if (grid.community.length === 0) return getCommunityBonus(score, restaurantUnlocked);
  if (!restaurantUnlocked) return { item: null, cost: 0 };
  return pickTier(grid.community, score);
}

// Creates the 3-layer pending_reward for a validated order.
// Single source of truth for reward writes since m20 dropped the SQL
// trigger — articles & coûts viennent du catalogue (reward_tiers) avec
// fallback sur les grilles héritées ci-dessus (ADR 0013).
// Idempotent: upsert ON CONFLICT (order_id) DO NOTHING; a 23505 on the
// partial index (one 'available' reward per member — ADR 0011) is also
// an expected no-op.
export async function createPendingReward(
  orderId: string,
  userId: string,
  teamId: string,
  restaurantId: string,
  amount: number
): Promise<void> {
  const adminClient = createAdminClient();

  const [{ data: scoreData }, restaurantUnlocked, budget, grid, teamTiers] = await Promise.all([
    adminClient
      .from("community_scores")
      .select("score, total_spent")
      .eq("team_id", teamId)
      .eq("restaurant_id", restaurantId)
      .single(),
    isRestaurantThresholdUnlocked(restaurantId),
    getBudgetStatus(restaurantId),
    loadRewardGrid(restaurantId),
    loadTeamTiers(restaurantId),
  ]);

  const row = scoreData as unknown as TeamScoreRow | null;
  const teamScore = row?.score ?? 0;
  const teamTotalSpent = row?.total_spent ?? 0;

  // Articles + coûts pilotés par le catalogue (ADR 0013), fallback grille
  // héritée. Plafond budget atteint (ADR 0012) : couches 2 et 3 désactivées,
  // la couche 1 (palier solo) reste intouchable.
  const solo = resolveSoloReward(grid, amount);
  const community = resolveCommunityBonus(grid, teamScore, restaurantUnlocked && budget.communityBonusActive);
  // Couche 3 — palier d'équipe sur la dépense cumulée (ADR 0014), remplace
  // l'ancienne récompense d'avancement Coupe du Monde.
  const advancement = budget.communityBonusActive
    ? resolveTeamTier(teamTiers, teamTotalSpent)
    : { item: null, cost: 0 };

  if (!solo.item && !community.item && !advancement.item) return;

  const { data: inserted, error } = await adminClient.from("pending_rewards").upsert(
    {
      user_id: userId,
      restaurant_id: restaurantId,
      order_id: orderId,
      solo_item: solo.item,
      solo_cost: solo.cost > 0 ? solo.cost : null,
      community_item: community.item,
      community_cost: community.cost > 0 ? community.cost : null,
      advancement_item: advancement.item,
      advancement_cost: advancement.cost > 0 ? advancement.cost : null,
      status: "available",
    },
    { onConflict: "order_id", ignoreDuplicates: true }
  ).select("id");

  if (error) {
    // 23505 hors order_id = index partiel ADR 0011 (un seul cadeau
    // 'available' par membre) — no-op attendu, pas une erreur
    if (error.code === "23505") return;
    throw new Error(`pending_rewards insert failed: ${error.message}`);
  }

  // Compteur budget : uniquement si une récompense a réellement été créée
  // (liste vide = conflit ignoré, rien distribué)
  if (inserted && inserted.length > 0) {
    const totalCost = solo.cost + community.cost + advancement.cost;
    await incrementRewardsCost(restaurantId, totalCost);
  }
}
