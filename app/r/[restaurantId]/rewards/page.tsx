import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getRestaurant } from "@/lib/restaurant";
import { isMemberActive } from "@/lib/rewards";
import type { Reward, CommunityScore } from "@/types";

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
  if (!membership?.team_id) redirect(`/r/${restaurantId}/my-team`);

  const [
    restaurant,
    { data: rewardsRaw },
    { data: scoreRaw },
    restaurantUnlocked,
    memberActive,
  ] = await Promise.all([
    getRestaurant(restaurantId),
    supabase
      .from("rewards")
      .select("*")
      .eq("is_active", true)
      .eq("restaurant_id", restaurantId)
      .order("level"),
    supabase
      .from("community_scores")
      .select("score, member_count")
      .eq("team_id", membership.team_id)
      .eq("restaurant_id", restaurantId)
      .single(),
    isRestaurantThresholdUnlocked(restaurantId),
    isMemberActive(user.id),
  ]);

  const rewards = (rewardsRaw as Reward[]) ?? [];
  // total_spent (euros) jamais sélectionné côté client — ADR 0007
  const score = scoreRaw as Pick<CommunityScore, "score" | "member_count"> | null;
  const currentScore = score?.score ?? 0;
  const memberCount = score?.member_count ?? 0;

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
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">Bonus communautaire bientôt disponible</p>
          <p className="text-xs">
            Les bonus communautaires seront actifs prochainement.
            Continue à commander directement — chaque commande validée fait progresser ta communauté.
          </p>
        </div>
      )}

      {/* Liste des paliers */}
      <div className="space-y-3">
        {rewards.map((reward) => {
          const isScoreReached = currentScore >= reward.score_threshold;
          const isMemberCountReached = memberCount >= reward.min_member_count;
          const isUnlocked = isScoreReached && isMemberCountReached && restaurantUnlocked;
          const isClaimable = isUnlocked && memberActive;
          const pct = Math.min(100, Math.round((currentScore / reward.score_threshold) * 100));
          const isFinalTier = reward.min_member_count > 0;

          return (
            <div
              key={reward.id}
              className={`bg-white rounded-2xl border p-5 ${
                isUnlocked
                  ? "border-green-300 shadow-sm"
                  : isFinalTier
                  ? "border-brand-gold/40 bg-amber-50/30"
                  : "border-gray-100"
              } ${!isScoreReached ? "opacity-75" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">
                    {isUnlocked ? "🎁" : isFinalTier ? "🏆" : "🔒"}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900">{reward.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isUnlocked
                          ? "bg-green-100 text-green-800"
                          : isFinalTier
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        Palier {reward.level}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{reward.description}</p>
                    {reward.gift_details && (
                      <p className="text-sm font-medium text-brand-red mt-1">
                        🎁 {reward.gift_details}
                      </p>
                    )}
                    {isFinalTier && (
                      <p className={`text-xs mt-1.5 font-medium ${isMemberCountReached ? "text-green-700" : "text-amber-700"}`}>
                        👥 {isMemberCountReached ? `${memberCount}/${reward.min_member_count} membres ✓` : `${memberCount}/${reward.min_member_count} membres requis`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">Seuil</p>
                  <p className="font-bold text-gray-900 text-sm tabular-nums">
                    {Number(reward.score_threshold).toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
                  </p>
                </div>
              </div>

              {/* Barre de progression */}
              {!isScoreReached && (
                <div className="mt-4">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-brand-red h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">{pct}%</p>
                </div>
              )}

              {/* Score atteint mais communauté trop petite */}
              {isScoreReached && isFinalTier && !isMemberCountReached && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-amber-800 text-xs font-medium">
                    Score atteint — il faut encore{" "}
                    <strong>{reward.min_member_count - memberCount} membre{reward.min_member_count - memberCount > 1 ? "s" : ""}</strong>{" "}
                    pour débloquer le Family Bucket.
                  </p>
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
                    Soumet et fais valider une commande pour récupérer cette récompense.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
