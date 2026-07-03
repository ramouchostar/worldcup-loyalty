import { createAdminClient } from "./supabase";
import { coverageSatisfied, type TeamCoverage } from "./reward-sizing";

// ADR 0014 — Couche 3 : paliers de dépense cumulée d'équipe.
// Quand la dépense cumulée de l'équipe (community_scores.total_spent) franchit
// un seuil, tous ses membres débloquent la récompense : un pourcentage borné
// ou un article gratuit du catalogue (ADR 0013). Remplace getAdvancementBonus.
// Données euros (seuils) : service role uniquement, jamais côté membre (ADR 0007).

export type TeamTierReward = { item: string | null; cost: number };

type MenuEmbed = { name: string; cost_price: number; is_active: boolean; reward_eligible: boolean };
type TeamTierRow = {
  threshold_spent: number;
  reward_kind: "percent" | "free_item";
  percent_value: number | null;
  menu_items: MenuEmbed | MenuEmbed[] | null;
};

export async function loadTeamTiers(restaurantId: string): Promise<TeamTierRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_tiers")
    .select("threshold_spent, reward_kind, percent_value, menu_items(name, cost_price, is_active, reward_eligible)")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("threshold_spent", { ascending: true });
  return (data ?? []) as unknown as TeamTierRow[];
}

// Résout l'article + coût d'un palier ; null si l'article a été retiré du
// catalogue ou exclu des cadeaux.
function tierReward(tier: TeamTierRow): TeamTierReward | null {
  if (tier.reward_kind === "percent") {
    return { item: `-${tier.percent_value ?? 0}%`, cost: 0 };
  }
  const mi = Array.isArray(tier.menu_items) ? tier.menu_items[0] : tier.menu_items;
  if (!mi || !mi.is_active || !mi.reward_eligible) return null;
  return { item: mi.name, cost: Number(mi.cost_price) };
}

// Palier d'équipe le plus élevé atteint par la dépense cumulée (tiers triés
// croissants). Pourcentage borné → coût 0 (réalisé au comptoir, hors plafond
// cadeaux). Article gratuit → coût matière du catalogue (compté au plafond).
// Couverture ADR 0017 : un article distribué à toute l'équipe doit être
// financé par la marge budget sur sa dépense cumulée — sinon cascade vers le
// palier couvert inférieur (les pourcentages, coût 0, passent toujours).
export function resolveTeamTier(
  tiers: TeamTierRow[],
  teamTotalSpent: number,
  coverage?: TeamCoverage
): TeamTierReward {
  let best: TeamTierReward | null = null;
  for (const t of tiers) {
    if (teamTotalSpent < Number(t.threshold_spent)) break;
    const reward = tierReward(t);
    if (!reward) continue;
    if (coverage && !coverageSatisfied(coverage, reward.cost)) continue;
    best = reward;
  }
  return best ?? { item: null, cost: 0 };
}
