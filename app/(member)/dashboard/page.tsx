import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isMemberActive } from "@/lib/rewards";
import { getCurrentThreshold, isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getRestaurantId } from "@/lib/restaurant";
import { ScoreCard } from "@/components/member/ScoreCard";
import { RewardProgressBar } from "@/components/member/RewardProgressBar";
import { PushPrompt } from "@/components/member/PushPrompt";
import type { Order, CommunityScore, PendingReward } from "@/types";

type ProfileWithTeam = {
  display_name: string;
  team_id: string;
  teams: { name: string; flag_emoji: string; is_active: boolean };
};

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurantId = getRestaurantId();

  const [
    { data: profileRaw },
    { data: orders },
    { data: pendingRaw },
    threshold,
    restaurantUnlocked,
    memberActive,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, team_id, teams(name, flag_emoji, is_active)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("orders")
      .select("id, amount, order_date, order_time, status, rejection_reason")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabase
      .from("pending_rewards")
      .select("*")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1),
    getCurrentThreshold(),
    isRestaurantThresholdUnlocked(),
    isMemberActive(user.id),
  ]);

  const profile = profileRaw as unknown as ProfileWithTeam | null;
  if (!profile?.team_id) redirect("/register");

  const { data: scoreRaw } = await supabase
    .from("community_scores")
    .select("team_id, member_count, total_spent, score, last_updated")
    .eq("team_id", profile.team_id)
    .eq("restaurant_id", restaurantId)
    .single();

  const score = scoreRaw as CommunityScore | null;
  const currentScore = score?.score ?? 0;
  const pendingReward = (pendingRaw as PendingReward[] ?? [])[0] ?? null;
  const team = profile.teams;

  // Palier de progression vers le prochain bonus communautaire
  const communityBonusThresholds = [
    { score: 1000,  label: "Frites Medium" },
    { score: 3000,  label: "Churros 12 pcs" },
    { score: 6000,  label: "Finest burger" },
    { score: 10000, label: "4 Tenders Menu" },
  ];
  const nextCommunityBonus = communityBonusThresholds.find(t => t.score > currentScore) ?? null;

  return (
    <div className="space-y-5 pb-4">

      {/* Bannière push — s'affiche uniquement si permission pas encore accordée */}
      <PushPrompt />

      {/* Alerte équipe éliminée */}
      {!team.is_active && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">🔴</span>
          <div>
            <p className="font-bold text-red-900">Ton équipe est éliminée</p>
            <p className="text-red-700 text-sm mt-1">
              {team.flag_emoji} {team.name} est hors du tournoi.
              Rejoins une autre communauté pour continuer.
            </p>
            <Link href="/transfer" className="inline-block mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
              Choisir une nouvelle équipe →
            </Link>
          </div>
        </div>
      )}

      {/* Carte équipe + score */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{team.flag_emoji}</span>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Ta communauté</p>
            <h2 className="text-xl font-bold text-gray-900">{team.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Bonjour, {profile.display_name} 👋
            </p>
          </div>
        </div>
        <ScoreCard
          teamId={profile.team_id}
          initial={{
            team_id: profile.team_id,
            member_count: score?.member_count ?? 0,
            total_spent: score?.total_spent ?? 0,
            score: currentScore,
          }}
        />
      </div>

      {/* Récompense en attente — carte principale */}
      {pendingReward ? (
        <div className="bg-gradient-to-br from-brand-gold/10 to-brand-red/5 rounded-2xl border-2 border-brand-gold/30 p-5">
          <p className="text-xs font-bold text-brand-gold uppercase tracking-widest mb-2">
            🎁 Ton prochain passage
          </p>
          <div className="space-y-2">
            {pendingReward.solo_item && (
              <div className="flex items-center gap-2">
                <span className="text-lg">🍗</span>
                <div>
                  <p className="font-bold text-gray-900">{pendingReward.solo_item}</p>
                  <p className="text-xs text-gray-500">Palier solo — ta commande</p>
                </div>
              </div>
            )}
            {pendingReward.community_item && (
              <div className="flex items-center gap-2">
                <span className="text-lg">👥</span>
                <div>
                  <p className="font-bold text-gray-900">+ {pendingReward.community_item}</p>
                  <p className="text-xs text-gray-500">Bonus communautaire</p>
                </div>
              </div>
            )}
            {pendingReward.advancement_item && (
              <div className="flex items-center gap-2">
                <span className="text-lg">🏆</span>
                <div>
                  <p className="font-bold text-gray-900">+ {pendingReward.advancement_item}</p>
                  <p className="text-xs text-gray-500">Récompense d&apos;avancement</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-3 border-t border-brand-gold/20 pt-3">
            Montre ton profil au comptoir Belchicken pour récupérer tes cadeaux.
          </p>
        </div>
      ) : memberActive ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-center">
          <p className="text-2xl mb-2">🎁</p>
          <p className="font-semibold text-gray-700 text-sm">Aucune récompense en attente</p>
          <p className="text-xs text-gray-400 mt-1">
            Passe une commande de €15+ pour débloquer ta prochaine récompense.
          </p>
        </div>
      ) : null}

      {/* Statut double verrou */}
      <div className={`rounded-xl p-4 flex items-center gap-3 ${
        restaurantUnlocked
          ? "bg-green-50 border border-green-200"
          : "bg-amber-50 border border-amber-200"
      }`}>
        <span className="text-2xl">{restaurantUnlocked ? "🔓" : "🔒"}</span>
        <div>
          <p className={`font-semibold text-sm ${restaurantUnlocked ? "text-green-900" : "text-amber-900"}`}>
            {restaurantUnlocked
              ? "Bonus communautaire débloqué"
              : "Bonus communautaire en attente de l'objectif CA"}
          </p>
          {threshold && (
            <p className={`text-xs mt-0.5 ${restaurantUnlocked ? "text-green-700" : "text-amber-700"}`}>
              {threshold.period_label} — objectif{" "}
              {threshold.target_revenue.toLocaleString("fr-BE", {
                style: "currency",
                currency: "EUR",
              })}
            </p>
          )}
        </div>
      </div>

      {/* Progression bonus communautaire */}
      {nextCommunityBonus && restaurantUnlocked && (
        <RewardProgressBar
          teamId={profile.team_id}
          initialScore={currentScore}
          nextReward={null}
          restaurantUnlocked={restaurantUnlocked}
        />
      )}

      {/* Prochain bonus communautaire */}
      {nextCommunityBonus && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Prochain bonus communautaire</p>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 text-sm">
              👥 + {nextCommunityBonus.label}
            </p>
            <p className="text-xs text-gray-400">
              à {nextCommunityBonus.score.toLocaleString("fr-BE")} pts
            </p>
          </div>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-brand-red h-1.5 rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round((currentScore / nextCommunityBonus.score) * 100))}%`
              }}
            />
          </div>
        </div>
      )}

      {/* Commandes récentes */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-900">Mes commandes</h3>
          <Link href="/submit-order" className="text-brand-red text-sm font-semibold hover:underline">
            + Ajouter
          </Link>
        </div>

        {!orders || orders.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm">Aucune commande soumise.</p>
            <Link
              href="/submit-order"
              className="inline-block mt-3 bg-brand-red text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Soumettre ma première commande
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {(orders as Order[]).map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {Number(order.amount).toLocaleString("fr-BE", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(order.order_date).toLocaleDateString("fr-BE")} à{" "}
                    {String(order.order_time).substring(0, 5)}
                  </p>
                  {order.rejection_reason && (
                    <p className="text-xs text-red-500 mt-0.5">{order.rejection_reason}</p>
                  )}
                </div>
                <StatusBadge status={order.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-300 pb-2">
        Score mis à jour toutes les 30 secondes
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:   { cls: "bg-amber-100 text-amber-800",  label: "En attente" },
    validated: { cls: "bg-green-100 text-green-800",  label: "Validée ✓" },
    rejected:  { cls: "bg-red-100 text-red-800",      label: "Rejetée" },
  };
  const { cls, label } = map[status] ?? map.pending;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${cls}`}>
      {label}
    </span>
  );
}
