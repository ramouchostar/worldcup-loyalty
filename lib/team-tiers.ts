import { createAdminClient } from "./supabase";

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

// Palier d'équipe le plus élevé atteint par la dépense cumulée (tiers triés
// croissants). Pourcentage borné → coût 0 (réalisé au comptoir, hors plafond
// cadeaux). Article gratuit → coût matière du catalogue (compté au plafond).
export function resolveTeamTier(tiers: TeamTierRow[], teamTotalSpent: number): TeamTierReward {
  let best: TeamTierRow | null = null;
  for (const t of tiers) {
    if (teamTotalSpent >= Number(t.threshold_spent)) best = t;
    else break;
  }
  if (!best) return { item: null, cost: 0 };

  if (best.reward_kind === "percent") {
    return { item: `-${best.percent_value ?? 0}%`, cost: 0 };
  }

  const mi = Array.isArray(best.menu_items) ? best.menu_items[0] : best.menu_items;
  if (!mi || !mi.is_active || !mi.reward_eligible) return { item: null, cost: 0 };
  return { item: mi.name, cost: Number(mi.cost_price) };
}
