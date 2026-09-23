import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { Restricted } from "@/components/admin/ui";
import { getRestaurantBudgetPct, getBudgetStatus } from "@/lib/budget";
import { getAverageBasket } from "@/lib/avg-basket";
import { personalPointsForOrder } from "@/lib/catalogue";
import { pickReferenceItems } from "@/lib/reward-rate";
import { RewardRateClient } from "./RewardRateClient";

// ADR 0068 — « Cadeaux » : le restaurateur choisit ce qu'il rend à ses
// clients, en voyant ce que chaque taux donne (vitesse d'obtention) et ce
// qu'il coûte (plafond du mois). Décision d'argent → gérant/manager
// seulement, comme les seuils (ADR 0041 §6).
export default async function AdminCadeauxPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getAdminAccess(user.id, restaurantId);
  if (!canManageEstablishment(access)) return <Restricted />;

  const admin = createAdminClient();
  const [pct, budget, avgBasket, { data: menu }, { data: changes }] = await Promise.all([
    getRestaurantBudgetPct(restaurantId),
    getBudgetStatus(restaurantId),
    getAverageBasket(restaurantId),
    admin
      .from("menu_items")
      .select("name, cost_price")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .eq("reward_eligible", true)
      .gt("cost_price", 0),
    admin
      .from("reward_rate_changes")
      .select("old_pct, new_pct, members_adjusted, changed_at")
      .eq("restaurant_id", restaurantId)
      .order("changed_at", { ascending: false })
      .limit(3),
  ]);

  const items = ((menu ?? []) as { name: string; cost_price: number }[]).map((m) => ({
    name: m.name,
    costPrice: Number(m.cost_price),
  }));

  return (
    <RewardRateClient
      restaurantId={restaurantId}
      currentPct={pct}
      avgBasket={avgBasket}
      ticketPoints={personalPointsForOrder(avgBasket)}
      monthlyProgramRevenue={budget.programRevenue}
      monthlyRewardsCost={budget.rewardsCost}
      referenceItems={pickReferenceItems(items)}
      catalogueSize={items.length}
      history={((changes ?? []) as { old_pct: number | null; new_pct: number; members_adjusted: number; changed_at: string }[])}
    />
  );
}
