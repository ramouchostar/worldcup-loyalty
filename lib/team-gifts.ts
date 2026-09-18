import { createAdminClient } from "./supabase";
import { getBudgetStatus } from "./budget";
import { isRestaurantThresholdUnlocked } from "./thresholds";
import { teamTiersToAward, type TeamTier } from "./team-gift-rules";

// ADR 0061 §7 — attribue les cadeaux d'équipe des paliers franchis.
//
// Appelé à la validation d'un ticket (l'équipe de ce ticket, tout de suite)
// et par le passage quotidien des notifications (toutes les équipes, filet de
// sécurité pour les autres chemins de validation). Idempotent : la base
// n'attribue un palier qu'une fois par équipe (`team_tier_awards`).
//
// Mêmes verrous que l'ancien bonus communautaire : double verrou et budget du
// mois (ADR 0012), couverture de l'équipe (ADR 0017). Un palier bloqué attend
// le prochain passage ; il n'est jamais perdu.

export type TeamAward = { teamId: string; tierId: string; item: string; members: number };

export async function awardCrossedTeamTiers(restaurantId: string, teamId?: string | null): Promise<TeamAward[]> {
  try {
    const admin = createAdminClient();
    const [restaurantUnlocked, budget] = await Promise.all([
      isRestaurantThresholdUnlocked(restaurantId),
      getBudgetStatus(restaurantId),
    ]);
    if (!restaurantUnlocked || !budget.communityBonusActive) return [];

    const { data: tierRows } = await admin
      .from("reward_tiers")
      .select("id, min_threshold, menu_items(name, cost_price, is_active)")
      .eq("restaurant_id", restaurantId)
      .eq("layer", "community")
      .eq("is_active", true);
    type Row = { id: string; min_threshold: number; menu_items: { name: string; cost_price: number | null; is_active: boolean } | null };
    const tiers: TeamTier[] = ((tierRows ?? []) as unknown as Row[])
      .filter((r) => r.menu_items?.is_active && r.menu_items.cost_price != null)
      .map((r) => ({ id: r.id, min: Number(r.min_threshold), item: r.menu_items!.name, cost: Number(r.menu_items!.cost_price) }));
    if (tiers.length === 0) return [];

    let scoresQuery = admin
      .from("community_scores")
      .select("team_id, score, total_spent, member_count, teams!inner(is_active)")
      .eq("restaurant_id", restaurantId)
      .eq("teams.is_active", true);
    if (teamId) scoresQuery = scoresQuery.eq("team_id", teamId);
    const { data: scores } = await scoresQuery;
    const teams = (scores ?? []) as { team_id: string; score: number | null; total_spent: number | null; member_count: number | null }[];
    if (teams.length === 0) return [];

    const { data: awardRows } = await admin
      .from("team_tier_awards")
      .select("team_id, tier_id")
      .in("team_id", teams.map((t) => t.team_id));
    const awardedByTeam = new Map<string, string[]>();
    for (const a of (awardRows ?? []) as { team_id: string; tier_id: string }[]) {
      awardedByTeam.set(a.team_id, [...(awardedByTeam.get(a.team_id) ?? []), a.tier_id]);
    }

    const awards: TeamAward[] = [];
    for (const team of teams) {
      const { toAward } = teamTiersToAward(Number(team.score ?? 0), tiers, awardedByTeam.get(team.team_id) ?? [], {
        memberCount: team.member_count ?? 0,
        teamTotalSpent: Number(team.total_spent ?? 0),
        budgetPct: budget.budgetPct,
      });
      for (const tier of toAward) {
        const { data, error } = await admin.rpc("award_team_tier", { p_team_id: team.team_id, p_tier_id: tier.id });
        if (error) {
          console.error("[team-gifts] attribution impossible:", team.team_id, tier.id, error.message);
          continue;
        }
        const members = Number(data ?? 0);
        if (members > 0) awards.push({ teamId: team.team_id, tierId: tier.id, item: tier.item, members });
      }
    }
    return awards;
  } catch (err) {
    // Best-effort : un échec ne doit jamais casser la validation d'un ticket.
    console.error("[team-gifts] échec:", err);
    return [];
  }
}
