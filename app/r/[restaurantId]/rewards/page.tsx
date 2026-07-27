import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getRestaurant } from "@/lib/restaurant";
import { isMemberActive, loadRewardGrid } from "@/lib/rewards";
import { getBudgetStatus } from "@/lib/budget";
import { coverageSatisfied } from "@/lib/reward-sizing";

// ADR 0028 / H3 — cette page lisait l'ancienne table `rewards` (jamais
// alimentée hors resto legacy → paliers vides partout ailleurs). Elle lit
// désormais la MÊME source que le dashboard : loadRewardGrid() (catalogue
// reward_tiers, ADR 0013). Score et seuils en POINTS (ADR 0028) — jamais
// d'euros côté client.

export default async function RewardsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membershipRaw } = await supabase
    .from("memberships")
    .select("team_id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  const membership = membershipRaw as { team_id: string | null } | null;

  // ADR 0018 — pas d'équipe : invitation douce plutôt qu'une redirection.
  if (!membership?.team_id) {
    return (
      <div className="space-y-5 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Récompenses</h1>
          <p className="text-gray-500 text-sm mt-1">
            Les paliers collectifs se débloquent en équipe.
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="font-bold text-gray-900 mb-1">Rejoins une équipe pour débloquer les paliers</p>
          <p className="text-sm text-gray-500 mb-4">
            Ton cadeau de base reste garanti à chaque commande — mais les bonus
            collectifs se gagnent ensemble, avec ta zone, ton école ou tes collègues.
          </p>
          <Link
            href={`/r/${restaurantId}/my-team`}
            className="inline-block bg-brand-red text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            Découvrir les équipes →
          </Link>
        </div>
      </div>
    );
  }

  // Catalogue (ADR 0013) via loadRewardGrid — mêmes paliers que le dashboard.
  // Le score (points courbés, ADR 0028) et la couverture (coûts €, ADR 0017)
  // se lisent en service-role : les euros ne sortent jamais au client (ADR 0007).
  const admin = createAdminClient();
  const [restaurant, grid, { data: scoreRaw }, restaurantUnlocked, memberActive] = await Promise.all([
    getRestaurant(restaurantId),
    loadRewardGrid(restaurantId),
    supabase
      .from("community_scores")
      .select("score, member_count")
      .eq("team_id", membership.team_id)
      .eq("restaurant_id", restaurantId)
      .single(),
    isRestaurantThresholdUnlocked(restaurantId),
    isMemberActive(user.id),
  ]);

  const score = scoreRaw as { score: number; member_count: number } | null;
  const currentScore = score?.score ?? 0;
  const memberCount = score?.member_count ?? 0;

  const [{ data: spentRaw }, budget] = await Promise.all([
    admin
      .from("community_scores")
      .select("total_spent")
      .eq("team_id", membership.team_id)
      .eq("restaurant_id", restaurantId)
      .single(),
    getBudgetStatus(restaurantId),
  ]);
  const coverage = {
    memberCount,
    teamTotalSpent: Number((spentRaw as { total_spent: number } | null)?.total_spent ?? 0),
    budgetPct: budget.budgetPct,
  };

  const communityTiers = grid.community; // GridTier[] : { min (seuil pts), item, cost }

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Récompenses</h1>
        <p className="text-gray-500 text-sm mt-1">
          Score actuel de ta communauté :{" "}
          <span className="font-bold text-gray-900">
            {currentScore.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
          </span>
          <span className="text-gray-400 ml-2">({memberCount} membre{memberCount !== 1 ? "s" : ""})</span>
        </p>
      </div>

      {/* Statut double verrou */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-xl p-3 text-center ${restaurantUnlocked ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
          <p className="text-xl mb-1">{restaurantUnlocked ? "🔓" : "🔒"}</p>
          <p className={`text-xs font-semibold ${restaurantUnlocked ? "text-green-800" : "text-amber-800"}`}>
            Bonus communautaire
          </p>
          <p className={`text-xs mt-0.5 ${restaurantUnlocked ? "text-green-600" : "text-amber-600"}`}>
            {restaurantUnlocked ? "Actif" : "Verrouillé"}
          </p>
        </div>
        <div className={`rounded-xl p-3 text-center ${memberActive ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`}>
          <p className="text-xl mb-1">{memberActive ? "✅" : "⏳"}</p>
          <p className={`text-xs font-semibold ${memberActive ? "text-green-800" : "text-gray-600"}`}>
            Ton statut
          </p>
          <p className={`text-xs mt-0.5 ${memberActive ? "text-green-600" : "text-gray-500"}`}>
            {memberActive ? "Membre actif" : "Pas encore de commande validée"}
          </p>
        </div>
      </div>

      {!restaurantUnlocked && (
        // Message neutre (ADR 0007) — jamais de promesse d'échéance.
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">Bonus communautaire en pause</p>
          <p className="text-xs">
            Ton cadeau de base reste garanti à chaque commande — et chaque commande
            validée fait progresser ta communauté.
          </p>
        </div>
      )}

      {/* Liste des paliers communautaires (catalogue) */}
      {communityTiers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          Les paliers collectifs de cet établissement arrivent bientôt — chaque
          commande directe validée fait déjà grimper le score de ton équipe.
        </div>
      ) : (
        <div className="space-y-3">
          {communityTiers.map((tier, idx) => {
            const isScoreReached = currentScore >= tier.min;
            // Couverture ADR 0017 dans le verrou — jamais expliquée côté client.
            const isCovered = coverageSatisfied(coverage, tier.cost);
            const isUnlocked = isScoreReached && restaurantUnlocked && isCovered;
            const isClaimable = isUnlocked && memberActive;
            const pct = tier.min > 0 ? Math.min(100, Math.round((currentScore / tier.min) * 100)) : 100;

            return (
              <div
                key={`${tier.item}-${idx}`}
                className={`bg-white rounded-2xl border p-5 ${
                  isUnlocked ? "border-green-300 shadow-sm" : "border-gray-100"
                } ${!isScoreReached ? "opacity-75" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{isUnlocked ? "🎁" : "🔒"}</span>
                    <div>
                      <p className="font-bold text-gray-900">{tier.item}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Palier communautaire</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">Seuil</p>
                    <p className="font-bold text-gray-900 text-sm tabular-nums">
                      {Number(tier.min).toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
                    </p>
                  </div>
                </div>

                {!isScoreReached && (
                  <div className="mt-4">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-brand-red h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1 text-right">{pct}%</p>
                  </div>
                )}

                {isClaimable && (
                  <div className="mt-4 bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-green-800 text-sm font-semibold">
                      🎉 Récompense disponible — présente-toi au comptoir {restaurant?.name ?? "du restaurant"} !
                    </p>
                  </div>
                )}

                {isUnlocked && !memberActive && (
                  <div className="mt-4 bg-amber-50 rounded-lg p-3 text-center">
                    <p className="text-amber-800 text-xs">
                      Soumets et fais valider une commande pour récupérer cette récompense.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
