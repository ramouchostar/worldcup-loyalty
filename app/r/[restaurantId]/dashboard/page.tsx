import { redirect } from "next/navigation";
import Link from "next/link";
import { Scan } from "lucide-react";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantId, isRestaurantOwner } from "@/lib/restaurant";
import { loadRewardGrid, resolveSoloReward, resolveCommunityBonus, nextSoloTier } from "@/lib/rewards";
import { loadTeamTiers, resolveTeamTier } from "@/lib/team-tiers";
import { getTeamPrompt } from "@/lib/teams";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getBudgetStatus } from "@/lib/budget";
import { getPointsBalance } from "@/lib/points";
import { pointsForOrder } from "@/lib/points-model";
import { FEEDBACK_ELIGIBILITY_MIN } from "@/lib/feedback";
import { ScoreCard } from "@/components/member/ScoreCard";
import { OnboardingFlow } from "@/components/member/OnboardingFlow";
import { InstallAppCard } from "@/components/InstallAppCard";
import { ActionsLadder } from "@/components/member/ActionsLadder";
import { ReferralCTA } from "@/components/member/ReferralCTA";
import type { Order, PendingReward } from "@/types";
import { RedeemButton } from "@/app/r/[restaurantId]/my-rewards/RedeemButton";

type MembershipWithTeam = {
  team_id: string | null;
  teams: { name: string; flag_emoji: string } | null;
};

export default async function DashboardPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const r = (path: string) => `/r/${restaurantId}${path}`;

  const [
    { data: membershipRaw },
    { data: orders },
    { data: pendingRaw },
    { count: redeemedCount },
    restaurantUnlocked,
    budget,
    { data: validatedOrdersData, count: validatedOrderCount },
    grid,
    isOwnerOfCurrent,
    { data: profileFlags },
  ] = await Promise.all([
    supabase
      .from("memberships")
      .select("team_id, teams(name, flag_emoji)")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, amount, order_number, order_date, status, rejection_reason")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabase
      .from("pending_rewards")
      .select("*")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "available")
      .order("created_at", { ascending: false }),
    supabase
      .from("pending_rewards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "redeemed"),
    isRestaurantThresholdUnlocked(restaurantId),
    getBudgetStatus(restaurantId),
    supabase
      .from("orders")
      .select("amount", { count: "exact" })
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated"),
    loadRewardGrid(restaurantId),
    isRestaurantOwner(user.id, restaurantId),
    supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
  ]);

  // Carte gérant (ADR 0030 §2) — owner de CE resto ou admin legacy sur le
  // resto par défaut. Pas le super-admin (il a son entrée Plateforme).
  const isManager =
    isOwnerOfCurrent ||
    (!!(profileFlags as { is_admin: boolean } | null)?.is_admin && restaurantId === getRestaurantId());

  const membership = membershipRaw as unknown as MembershipWithTeam | null;
  const hasTeam = !!membership?.team_id;

  // Score (points, côté membre) + dépense cumulée d'équipe (euros, service role —
  // jamais rendue, sert seulement à résoudre la couche 3). ADR 0007.
  const admin = createAdminClient();
  const [scoreResult, spentResult, teamTiers, reserveBalance, { count: saverTierCount }, rankResult, teamPrompt] = await Promise.all([
    hasTeam
      ? supabase.from("community_scores").select("member_count, score").eq("team_id", membership!.team_id!).eq("restaurant_id", restaurantId).single()
      : Promise.resolve({ data: null }),
    hasTeam
      ? admin.from("community_scores").select("total_spent").eq("team_id", membership!.team_id!).eq("restaurant_id", restaurantId).single()
      : Promise.resolve({ data: null }),
    loadTeamTiers(restaurantId),
    // Réserve de points (ADR 0021) — micro-état de la tuile d'accès
    getPointsBalance(user.id, restaurantId),
    admin
      .from("reward_tiers")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("layer", "saver")
      .eq("is_active", true),
    // Rang de l'équipe (micro-état tuile Classement, ADR 0030 §4) — colonnes
    // publiques uniquement (score/member_count, m41), petit volume par resto.
    hasTeam
      ? supabase
          .from("community_scores")
          .select("team_id, score")
          .eq("restaurant_id", restaurantId)
          .order("score", { ascending: false })
      : Promise.resolve({ data: null }),
    // ADR 0031 — « te reconnais-tu ? » : ne se pose qu'au membre sans équipe,
    // et seulement quand la relance est échue (état serveur, pas localStorage).
    hasTeam ? Promise.resolve(null) : getTeamPrompt(user.id, restaurantId),
  ]);
  const scoreRaw = scoreResult.data;
  const spentRaw = spentResult.data;

  const score = (scoreRaw as { score: number } | null)?.score ?? 0;
  const memberCount = (scoreRaw as { member_count: number } | null)?.member_count ?? 0;

  // Micro-états des tuiles d'accès (ADR 0030 §4)
  const rankRows = (rankResult.data as { team_id: string; score: number }[] | null) ?? [];
  const teamRank = hasTeam ? rankRows.findIndex((row) => row.team_id === membership!.team_id) + 1 : 0;
  const teamCount = rankRows.length;
  const teamTotalSpent = Number((spentRaw as { total_spent: number } | null)?.total_spent ?? 0);
  const pendingRewards = (pendingRaw as PendingReward[] ?? []);
  const orderList = (orders as Order[] ?? []);
  const team = membership?.teams ?? null;

  // ── Hero preview ───────────────────────────────────────────────────────────
  const totalSpent = (validatedOrdersData ?? []).reduce((s, o) => s + Number((o as { amount: number }).amount), 0);
  // Points perso cumulés (ADR 0028) — côté client, zéro euro même pour soi.
  const totalPoints = (validatedOrdersData ?? []).reduce((s, o) => s + pointsForOrder(Number((o as { amount: number }).amount)), 0);
  const validCount = validatedOrderCount ?? 0;
  const memberActive = validCount > 0;
  const avgAmount = validCount > 0 ? totalSpent / validCount : 25;
  const previewAmt = Math.max(15, Math.round(avgAmount));

  // Plafond budget (ADR 0012) : couches 2 et 3 masquées si en pause.
  // Couverture d'équipe (ADR 0017) : le bonus affiché est le palier réellement
  // finançable pour cette taille d'équipe — cohérent avec createPendingReward.
  const coverage = { memberCount, teamTotalSpent, budgetPct: budget.budgetPct };
  const heroSolo = resolveSoloReward(grid, previewAmt);
  const heroNextSolo = nextSoloTier(grid, previewAmt);
  const heroCommunity = resolveCommunityBonus(
    grid,
    score,
    restaurantUnlocked && budget.communityBonusActive,
    coverage
  );
  const heroTeamTier = budget.communityBonusActive
    ? resolveTeamTier(teamTiers, teamTotalSpent, coverage)
    : { item: null, cost: 0 };

  // Grille communautaire affichée : celle du catalogue (loadRewardGrid gère
  // le fallback hérité pour le resto legacy). Vide = section masquée.
  const communityTiers = grid.community.map((t) => ({ score: t.min, item: t.item }));

  const isWeakCommunity = communityTiers.length > 0 && score < communityTiers[0].score;
  const nextTier = communityTiers.find((t) => t.score > score) ?? null;
  const prevTierScore = nextTier ? (communityTiers[communityTiers.indexOf(nextTier) - 1]?.score ?? 0) : 0;
  const tierPct = nextTier
    ? Math.min(100, Math.round(((score - prevTierScore) / (nextTier.score - prevTierScore)) * 100))
    : 100;

  return (
    <div className="space-y-5 pb-4">
      {/* ── Carte gérant (ADR 0030 §2, position 0) ─────────────────────────── */}
      {isManager && (
        <Link
          href={`/admin/${restaurantId}`}
          className="flex items-center justify-between bg-brand-dark text-white rounded-2xl p-4 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">🍽️</span>
            <div>
              <p className="font-bold text-sm">Vous êtes le gérant de ce restaurant</p>
              <p className="text-xs text-gray-400">Commandes, ventes, broadcasts, réglages…</p>
            </div>
          </div>
          <span className="text-brand-gold font-semibold text-sm shrink-0">Console →</span>
        </Link>
      )}

      <OnboardingFlow teamPrompt={teamPrompt} />

      {/* Récompenses à récupérer au comptoir — le plus urgent (48h avant
          expiration), reste un bloc distinct en tête de flux. */}
      {pendingRewards.length > 0 && (
        <div className="bg-gradient-to-br from-brand-gold/15 to-brand-red/5 rounded-2xl border-2 border-brand-gold/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-brand-gold uppercase tracking-widest">
              🛎 À récupérer au comptoir
              {pendingRewards.length > 1 && (
                <span className="ml-2 bg-brand-gold text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingRewards.length}
                </span>
              )}
            </p>
            <Link href={r("/my-rewards")} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Historique →
            </Link>
          </div>
          <div className="space-y-4">
            {pendingRewards.map((r2, idx) => (
              <div key={r2.id} className={idx > 0 ? "pt-3 border-t border-brand-gold/20" : ""}>
                {pendingRewards.length > 1 && (
                  <p className="text-xs text-gray-400 mb-1.5">Commande {pendingRewards.length - idx}</p>
                )}
                <div className="space-y-1.5">
                  {r2.solo_item && (
                    <div className="flex items-center gap-2">
                      <span>🍗</span>
                      <span className="font-bold text-gray-900">{r2.solo_item}</span>
                      <span className="text-xs text-gray-400 ml-auto">cadeau de base</span>
                    </div>
                  )}
                  {r2.community_item && (
                    <div className="flex items-center gap-2">
                      <span>👥</span>
                      <span className="font-bold text-gray-900">+ {r2.community_item}</span>
                      <span className="text-xs text-gray-400 ml-auto">bonus communautaire</span>
                    </div>
                  )}
                  {r2.advancement_item && (
                    <div className="flex items-center gap-2">
                      <span>🏆</span>
                      <span className="font-bold text-gray-900">+ {r2.advancement_item}</span>
                      <span className="text-xs text-gray-400 ml-auto">bonus d&apos;équipe</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-brand-gold/20 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">
                {pendingRewards.length > 1
                  ? `${pendingRewards.length} cadeaux à récupérer au comptoir`
                  : "Cadeau à récupérer au comptoir"}
              </p>
              <p className="text-xs text-amber-600 font-medium mt-0.5">⏰ 48h pour récupérer avant expiration</p>
            </div>
            <RedeemButton />
          </div>
        </div>
      )}

      {/* ── Flux continu — plus de cartes compartimentées : un seul feuillet
          blanc, sections séparées par un simple trait, dans l'ordre de
          priorité (ADR 0010 : hero d'abord, contenu = conséquence pas
          chiffre). Palier solo + jetons à faire d'abord — ce qui bouge le
          plus souvent pour le membre. */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        {/* Palier solo : nom du cadeau + barre de progression vers le
            suivant, jamais de seuil/écart chiffré (ADR 0028 §6, "perd le
            ~€25"). Orange codé en dur — pour Kraainem brand-gold/brand-red
            résolvent en rouge (brand_accent), lu comme un danger. */}
        <div className="p-5">
          {heroSolo.item || heroNextSolo ? (
            <div className={heroCommunity.item || heroTeamTier.item ? "mb-4" : ""}>
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-2xl" aria-hidden="true">🍗</span>
                <span className="text-xl font-black text-gray-900 text-center">
                  {heroSolo.item ?? "Ton premier cadeau"}
                </span>
              </div>

              {heroNextSolo ? (
                <>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-orange-500 transition-all duration-700"
                      style={{ width: `${heroNextSolo.pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-semibold text-gray-400 truncate">
                      {heroSolo.item ?? "Début"}
                    </span>
                    <span className="text-xs font-semibold text-gray-400 truncate">
                      {heroNextSolo.item}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-center text-gray-400">🏆 Palier maximum atteint</p>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-gray-400">Aucun cadeau solo pour l&apos;instant</p>
          )}

          {(heroCommunity.item || heroTeamTier.item) && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              {heroCommunity.item && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>👥</span>
                    <span className="font-bold text-orange-600">+ {heroCommunity.item}</span>
                  </div>
                  <span className="text-xs text-gray-400">← {team?.flag_emoji} force de ta communauté</span>
                </div>
              )}

              {heroTeamTier.item && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>🏆</span>
                    <span className="font-bold text-orange-600">+ {heroTeamTier.item}</span>
                  </div>
                  <span className="text-xs text-gray-400">← palier d&apos;équipe débloqué</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Jetons — échelle complète (fait / en cours / à venir), plus le
            bonus d'équipe en dernière marche. Disparaît pour de bon une
            fois toutes les actions validées (ADR 0024 : pas de nouvelle
            proposition pour une action déjà faite). */}
        <div className="p-5">
          <ActionsLadder
            nextCommunityItem={nextTier?.item ?? null}
            nextCommunityScore={nextTier?.score ?? null}
          />
        </div>
      </div>

      {/* Rappel scan — l'action la plus rentable, toujours accessible en
          plus du bouton flottant de la bottom nav. */}
      <Link
        href={r("/submit-order")}
        className="flex items-center justify-between gap-4 bg-brand-dark text-white rounded-2xl p-5 hover:bg-gray-800 transition-colors"
      >
        <div>
          <p className="font-bold text-sm">Scanner mon ticket</p>
          <p className="text-xs text-gray-400 mt-0.5">pour accumuler des points</p>
        </div>
        <span className="shrink-0 w-11 h-11 rounded-full bg-orange-500 flex items-center justify-center">
          <Scan className="w-5 h-5 text-white" strokeWidth={2.5} aria-hidden="true" />
        </span>
      </Link>

      {/* Parrainage — récompense rappelée, lien WhatsApp direct. */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <ReferralCTA />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        {/* ── Progression d'équipe ────────────────────────────────────────── */}
        {!team ? (
          <div id="tour-community-progress" className="p-5 text-center">
            <p className="text-3xl mb-2">👥</p>
            <p className="font-bold text-gray-900 mb-1">Pas encore d&apos;équipe</p>
            <p className="text-sm text-gray-500 mb-4">
              Crée ton équipe ou rejoins-en une pour débloquer le bonus communautaire sur chaque commande.
            </p>
            <Link
              href={r("/my-team")}
              className="inline-block bg-brand-red text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-red/85 transition-colors"
            >
              Voir mon équipe →
            </Link>
          </div>
        ) : (
        <div id="tour-community-progress" className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{team.flag_emoji}</span>
            <p className="font-bold text-gray-900">Équipe {team.name}</p>
          </div>

          <ScoreCard
            teamId={membership!.team_id!}
            initial={{ team_id: membership!.team_id!, member_count: memberCount, score }}
          />

          <div className="mt-4 pt-4 border-t border-gray-100">
            {/* Plafond budget atteint (ADR 0012) — message neutre (ADR 0007) */}
            {!budget.communityBonusActive && (
              <div className="mb-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-sm">⏸️</span>
                <p className="text-xs font-medium text-gray-600">
                  Bonus communautaire en pause — ton cadeau de base reste garanti à chaque commande.
                </p>
              </div>
            )}

            {communityTiers.length === 0 ? (
              // Aucun palier communautaire configuré (resto sans grille) —
              // aucune promesse d'article, message neutre (ADR 0007)
              <p className="text-xs text-gray-400 text-center py-1">
                Le score de ton équipe grandit à chaque commande directe.
              </p>
            ) : nextTier ? (
              <>
                <div className="flex justify-between text-xs text-gray-400 mb-1.5 tabular-nums">
                  <span>{score.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts</span>
                  <span>vers {nextTier.score.toLocaleString("fr-BE")} pts</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-brand-red h-2 rounded-full transition-all duration-700"
                    style={{ width: `${tierPct}%` }}
                  />
                </div>

                {isWeakCommunity ? (
                  <div className="mt-3 space-y-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-blue-900">
                        À{" "}
                        {(nextTier.score - score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}{" "}
                        pts du 1er bonus communautaire
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Chaque commande de tes coéquipiers vous rapproche du bonus&nbsp;
                        <span className="font-semibold">+ {nextTier.item}</span>.
                      </p>
                    </div>
                    <Link
                      href={r("/my-team")}
                      className="flex items-center justify-center gap-2 w-full bg-green-500 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
                    >
                      <span>📲</span> Inviter dans mon équipe
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                      <span className="text-lg">👥</span>
                      <div>
                        <p className="text-xs text-gray-500">Prochain bonus communautaire</p>
                        <p className="font-semibold text-gray-900 text-sm">+ {nextTier.item} sur chaque commande</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      💡 Chaque commande directe de ton équipe vous rapproche.
                    </p>
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-1">
                <p className="text-2xl mb-1">🏆</p>
                <p className="font-bold text-green-800 text-sm">Bonus maximum atteint !</p>
                {/* Palier réellement finançable (couverture ADR 0017), message neutre (ADR 0007) */}
                <p className="text-xs text-gray-500">
                  + {heroCommunity.item ?? communityTiers[communityTiers.length - 1].item} sur chaque commande
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Tuiles d'accès (ADR 0030 §4) — permanentes, à états
            progressifs : on ne cache jamais une fonctionnalité, on montre ce
            qui manque pour l'utiliser. */}
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={r("/rewards")}
              className="rounded-xl bg-gray-50 p-4 hover:bg-gray-100 transition-colors"
            >
              <p className="text-xl mb-1" aria-hidden="true">🎁</p>
              <p className="font-bold text-gray-900 text-sm">Récompenses</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {!hasTeam
                  ? "Rejoins une équipe"
                  : (() => {
                      const unlocked = communityTiers.filter((t) => t.score <= score).length;
                      return unlocked > 0
                        ? `${unlocked} palier${unlocked > 1 ? "s" : ""} atteint${unlocked > 1 ? "s" : ""}`
                        : "Découvre les paliers";
                    })()}
              </p>
            </Link>

            <Link
              href={r("/leaderboard")}
              className="rounded-xl bg-gray-50 p-4 hover:bg-gray-100 transition-colors"
            >
              <p className="text-xl mb-1" aria-hidden="true">🏆</p>
              <p className="font-bold text-gray-900 text-sm">Classement</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {hasTeam && teamRank > 0 ? `#${teamRank} sur ${teamCount}` : "Découvre les équipes"}
              </p>
            </Link>

            <Link
              href={r("/feedback")}
              className="rounded-xl bg-gray-50 p-4 hover:bg-gray-100 transition-colors"
            >
              <p className="text-xl mb-1" aria-hidden="true">💬</p>
              <p className="font-bold text-gray-900 text-sm">Mon resto</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {validCount >= FEEDBACK_ELIGIBILITY_MIN
                  ? "Encourage ou signale, en privé"
                  : `Encore ${FEEDBACK_ELIGIBILITY_MIN - validCount} commande${FEEDBACK_ELIGIBILITY_MIN - validCount > 1 ? "s" : ""} pour donner ton avis`}
              </p>
            </Link>

            <Link
              href={r("/reserve")}
              className="rounded-xl bg-gray-50 p-4 hover:bg-gray-100 transition-colors"
            >
              <p className="text-xl mb-1" aria-hidden="true">💰</p>
              <p className="font-bold text-gray-900 text-sm">Ma réserve</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {reserveBalance > 0
                  ? `${reserveBalance} de côté`
                  : (saverTierCount ?? 0) > 0
                    ? "Échange-la contre un gros cadeau"
                    : "Mets tes cadeaux de côté"}
              </p>
            </Link>
          </div>
        </div>

        {/* Commandes récentes */}
        <div className="p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-900">Mes commandes</h3>
            <Link href={r("/submit-order")} className="text-brand-red text-sm font-semibold hover:underline">
              + Ajouter
            </Link>
          </div>

          {orderList.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm">Aucune commande soumise.</p>
              <Link
                href={r("/submit-order")}
                className="inline-block mt-3 bg-brand-red text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-brand-red/85 transition-colors"
              >
                Soumettre ma première commande
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {orderList.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className={`font-medium text-sm ${order.status === "validated" ? "text-gray-900" : "text-gray-400"}`}>
                      {order.status === "validated"
                        ? `+${pointsForOrder(Number(order.amount))} pts`
                        : order.status === "pending" ? "En validation…" : "Non validée"}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      {order.order_number ?? new Date(order.order_date).toLocaleDateString("fr-BE")}
                    </p>
                    {order.rejection_reason && <p className="text-xs text-red-500 mt-0.5">{order.rejection_reason}</p>}
                  </div>
                  <StatusBadge status={order.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 3 — Stats perso (subtil, bas de page) ─────────────────── */}
      {memberActive && (
        <p className="text-center text-xs text-gray-400 py-1">
          {validCount} commande{validCount > 1 ? "s" : ""} validée{validCount > 1 ? "s" : ""}
          {" · "}
          {totalPoints.toLocaleString("fr-BE")} pts gagnés
          {(redeemedCount ?? 0) > 0 && (
            <> · {redeemedCount} cadeau{(redeemedCount ?? 0) > 1 ? "x" : ""} récupéré{(redeemedCount ?? 0) > 1 ? "s" : ""}</>
          )}
        </p>
      )}

      {/* ── ADR 0038 — rattrapage de l'installation ────────────────────────
          L'onboarding ne propose l'app qu'une fois ; qui l'a manquée ou
          reportée n'avait plus aucun chemin. Disparaît une fois installée. */}
      <InstallAppCard audience="membre" surface="dashboard_membre" />

      <p className="text-center text-xs text-gray-500 pb-2">Score mis à jour toutes les 30 secondes</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: "bg-amber-100 text-amber-800", label: "En attente" },
    validated: { cls: "bg-green-100 text-green-800", label: "Validée ✓" },
    rejected: { cls: "bg-red-100 text-red-800", label: "Rejetée" },
  };
  const { cls, label } = map[status] ?? map.pending;
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${cls}`}>{label}</span>;
}
