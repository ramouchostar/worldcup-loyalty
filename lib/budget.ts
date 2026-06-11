import { createAdminClient } from "./supabase";

// ADR 0012 — plafond de budget cadeaux en % du CA généré par le programme.
// Données euros : service role uniquement, jamais exposées au client (ADR 0007).

const DEFAULT_BUDGET_PCT = parseFloat(process.env.REWARD_BUDGET_PCT ?? "0.08");

export type BudgetStatus = {
  programRevenue: number;
  rewardsCost: number;
  budgetPct: number;
  communityBonusActive: boolean;
};

// Premier jour du mois courant (UTC) — clé de période
export function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function getBudgetStatus(restaurantId: string): Promise<BudgetStatus> {
  const admin = createAdminClient();
  const period = currentPeriodMonth();

  const { data, error } = await admin
    .from("reward_budget_tracking")
    .select("program_revenue, rewards_cost, budget_pct")
    .eq("restaurant_id", restaurantId)
    .eq("period_month", period)
    .maybeSingle();

  // Fail-open si la table n'existe pas encore (m21 non appliquée) :
  // comportement pré-ADR-0012, le bonus reste actif
  if (error) {
    console.error("[budget] getBudgetStatus failed:", error.message);
    return {
      programRevenue: 0,
      rewardsCost: 0,
      budgetPct: DEFAULT_BUDGET_PCT,
      communityBonusActive: true,
    };
  }

  // Ligne du mois absente → la créer (no-op si course avec une autre requête)
  if (!data) {
    await admin.from("reward_budget_tracking").upsert(
      { restaurant_id: restaurantId, period_month: period },
      { onConflict: "restaurant_id,period_month", ignoreDuplicates: true }
    );
  }

  const programRevenue = Number(data?.program_revenue ?? 0);
  const rewardsCost = Number(data?.rewards_cost ?? 0);
  const budgetPct = Number(data?.budget_pct ?? DEFAULT_BUDGET_PCT);

  return {
    programRevenue,
    rewardsCost,
    budgetPct,
    // Budget proportionnel au CA : zéro revenu programme = zéro budget
    communityBonusActive: rewardsCost < programRevenue * budgetPct,
  };
}

// Incréments atomiques via la fonction SQL increment_reward_budget (m21) —
// un seul round-trip, recalcule community_bonus_active au passage.
// Best-effort : un échec est loggé mais ne bloque jamais le flux de commande.

export async function incrementProgramRevenue(restaurantId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("increment_reward_budget", {
    p_restaurant_id: restaurantId,
    p_revenue: amount,
    p_cost: 0,
  });
  if (error) console.error("[budget] incrementProgramRevenue failed:", error.message);
}

export async function incrementRewardsCost(restaurantId: string, cost: number): Promise<void> {
  if (cost <= 0) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("increment_reward_budget", {
    p_restaurant_id: restaurantId,
    p_revenue: 0,
    p_cost: cost,
  });
  if (error) console.error("[budget] incrementRewardsCost failed:", error.message);
}
