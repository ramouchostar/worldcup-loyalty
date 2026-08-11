import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantBranding, logoPublicUrl, getRestaurantId, isRestaurantOwner } from "@/lib/restaurant";
import { loadRewardGrid, resolveSoloReward, resolveCommunityBonus } from "@/lib/rewards";
import { loadTeamTiers, resolveTeamTier } from "@/lib/team-tiers";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getBudgetStatus } from "@/lib/budget";
import { getPointsBalance } from "@/lib/points";
import { pointsForOrder } from "@/lib/points-model";
import { FEEDBACK_ELIGIBILITY_MIN } from "@/lib/feedback";
import { ScoreCard } from "@/components/member/ScoreCard";
import { OnboardingFlow } from "@/components/member/OnboardingFlow";
import { ActionCardsSection } from "@/components/member/ActionCardsSection";
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

  // Image hero (m48) — décorative uniquement, aucun impact sur le contenu
  // imposé par l'ADR 0010 (3 lignes par couche, fallback €25).
  const branding = await getRestaurantBranding(restaurantId);
  const heroImageUrl = logoPublicUrl(branding.hero_image_url);

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
  const [scoreResult, spentResult, teamTiers, reserveBalance, { count: saverTierCount }, rankResult] = await Promise.all([
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
  const heroCommunity = resolveCommunityBonus(
    grid,
    score,
    restaurantUnlocked && budget.communityBonusActive,
    coverage
  );
  const heroTeamTier = budget.communityBonusActive
    ? resolveTeamTier(teamTiers, teamTotalSpent, coverage)
    : { item: null, cost: 0 };
  const heroCount = [heroSolo.item, heroCommunity.item, heroTeamTier.item].filter(Boolean).length;

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
              {/* Fond sombre : gray-400 y contraste bien — seule la taille passe à sm (porteur) */}
              <p className="text-sm text-gray-400">Commandes, ventes, broadcasts, réglages…</p>
            </div>
          </div>
          <span className="text-brand-gold font-semibold text-sm shrink-0">Console →</span>
        </Link>
      )}

      <OnboardingFlow hasValidatedOrder={validCount > 0} />

      {/* ── SECTION 1 — Hero preview ───────────────────────────────────────── */}
      <div
        className="bg-gradient-to-br from-brand-dark to-brand-dark/70 bg-cover bg-center rounded-2xl p-5 text-white"
        style={
          heroImageUrl
            ? {
                // Transformation Supabase Storage (audit UX 2026-08-11, perf) : les
                // paramètres width/quality sont ceux de l'Image Transformation
                // Supabase (plan Pro requis, servie via /render/image/). Sur l'URL
                // publique /object/ les query params inconnus sont ignorés →
                // fallback gracieux : l'original est servi tel quel.
                backgroundImage: `linear-gradient(to bottom right, rgb(var(--brand-dark) / 0.88), rgb(var(--brand-dark) / 0.78)), url(${heroImageUrl}?width=800&quality=75)`,
              }
            : undefined
        }
      >
        {/* Fond sombre : gray-400/300 y contrastent bien — uppercase retiré (FALC), taille sm (porteur) */}
        <p className="text-sm font-semibold text-gray-400 mb-1">🎁 Ta prochaine commande</p>
        <p className="text-sm text-gray-300 mb-4">Pour ta prochaine commande directe :</p>

        <div className="space-y-3">
          {heroSolo.item ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🍗</span>
                <span className="font-bold">{heroSolo.item}</span>
              </div>
              <span className="text-sm text-gray-400">← ton cadeau de base</span>
            </div>
          ) : (
            <div className="flex items-center justify-between opacity-40">
              <span className="text-sm text-gray-400">Pas encore de cadeau de base</span>
            </div>
          )}

          {heroCommunity.item && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>👥</span>
                <span className="font-bold text-brand-gold">+ {heroCommunity.item}</span>
              </div>
              <span className="text-sm text-gray-400">← {team?.flag_emoji} force de ta communauté</span>
            </div>
          )}

          {heroTeamTier.item && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🏆</span>
                <span className="font-bold text-brand-gold">+ {heroTeamTier.item}</span>
              </div>
              <span className="text-sm text-gray-400">← bonus d&apos;équipe débloqué</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
          <p className="text-sm text-gray-300">
            {heroCount > 0
              ? `${heroCount} cadeau${heroCount > 1 ? "x" : ""} t'attend${heroCount > 1 ? "ent" : ""} au comptoir`
              : "Commande pour débloquer tes cadeaux"}
          </p>
          <Link
            href={r("/submit-order")}
            className="inline-flex items-center bg-brand-red text-white text-sm font-bold px-5 py-3 min-h-[48px] rounded-lg hover:bg-brand-red/85 transition-colors shrink-0"
          >
            Scanner mon ticket →
          </Link>
        </div>
      </div>

      {/* Récompenses à récupérer au comptoir */}
      {pendingRewards.length > 0 && (
        <div className="bg-gradient-to-br from-brand-gold/15 to-brand-red/5 rounded-2xl border-2 border-brand-gold/40 p-5">
          <div className="flex items-center justify-between mb-3">
            {/* Fond clair : brand-gold illisible en texte (2,10:1) → brand-red ;
                uppercase retiré (FALC), taille sm (libellé porteur). Audit UX 2026-08-11. */}
            <p className="text-sm font-bold text-brand-red">
              🛎 À récupérer au comptoir
              {pendingRewards.length > 1 && (
                <span className="ml-2 bg-brand-red text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingRewards.length}
                </span>
              )}
            </p>
            <Link href={r("/my-rewards")} className="text-sm min-h-[44px] inline-flex items-center text-gray-500 hover:text-gray-700 underline">
              Historique →
            </Link>
          </div>
          <div className="space-y-4">
            {pendingRewards.map((r2, idx) => (
              <div key={r2.id} className={idx > 0 ? "pt-3 border-t border-brand-gold/20" : ""}>
                {pendingRewards.length > 1 && (
                  <p className="text-xs text-gray-500 mb-1.5">Commande {pendingRewards.length - idx}</p>
                )}
                <div className="space-y-1.5">
                  {r2.solo_item && (
                    <div className="flex items-center gap-2">
                      <span>🍗</span>
                      <span className="font-bold text-gray-900">{r2.solo_item}</span>
                      <span className="text-sm text-gray-500 ml-auto">cadeau de base</span>
                    </div>
                  )}
                  {r2.community_item && (
                    <div className="flex items-center gap-2">
                      <span>👥</span>
                      <span className="font-bold text-gray-900">+ {r2.community_item}</span>
                      <span className="text-sm text-gray-500 ml-auto">bonus communautaire</span>
                    </div>
                  )}
                  {r2.advancement_item && (
                    <div className="flex items-center gap-2">
                      <span>🏆</span>
                      <span className="font-bold text-gray-900">+ {r2.advancement_item}</span>
                      <span className="text-sm text-gray-500 ml-auto">bonus d&apos;équipe</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-brand-gold/20 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                {pendingRewards.length > 1
                  ? `${pendingRewards.length} cadeaux à récupérer au comptoir`
                  : "Cadeau à récupérer au comptoir"}
              </p>
              <p className="text-sm text-amber-700 font-medium mt-0.5">⏰ 48h pour récupérer avant expiration</p>
            </div>
            <RedeemButton />
          </div>
        </div>
      )}

      {/* ── Carte Actions — missions sociales séquentielles (jetons) ───────
          Une seule action affichée à la fois ; la suivante n'apparaît
          qu'une fois la précédente accomplie (ou soumise en validation). */}
      <ActionCardsSection />

      {/* ── SECTION 2 — Progression d'équipe ──────────────────────────────── */}
      {!team ? (
        <div id="tour-community-progress" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
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
      <div id="tour-community-progress" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
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
              <p className="text-sm font-medium text-gray-600">
                Bonus communautaire en pause — ton cadeau de base reste garanti à chaque commande.
              </p>
            </div>
          )}

          {communityTiers.length === 0 ? (
            // Aucun palier communautaire configuré (resto sans grille) —
            // aucune promesse d'article, message neutre (ADR 0007)
            <p className="text-sm text-gray-500 text-center py-1">
              Le score de ton équipe grandit à chaque commande directe.
            </p>
          ) : nextTier ? (
            <>
              <div className="flex justify-between text-sm text-gray-500 mb-1.5 tabular-nums">
                <span>{score.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts</span>
                <span>vers {nextTier.score.toLocaleString("fr-BE")} pts</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-brand-red h-2 rounded-full transition-all duration-700"
                  // Plancher visuel : une barre jamais à 0 % (progression dotée, audit UX)
                  style={{ width: `${Math.max(tierPct, 6)}%` }}
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
                    <p className="text-sm text-blue-700 mt-1">
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
                      <p className="text-sm text-gray-500">Prochain bonus communautaire</p>
                      <p className="font-semibold text-gray-900 text-sm">+ {nextTier.item} sur chaque commande</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-2 text-center">
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
              <p className="text-sm text-gray-500">
                + {heroCommunity.item ?? communityTiers[communityTiers.length - 1].item} sur chaque commande
              </p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── SECTION tuiles d'accès (ADR 0030 §4) — permanentes, à états
          progressifs : on ne cache jamais une fonctionnalité, on montre ce
          qui manque pour l'utiliser. */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={r("/rewards")}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:border-brand-red/40 transition-colors"
        >
          <p className="text-xl mb-1" aria-hidden="true">🎁</p>
          <p className="font-bold text-gray-900 text-sm flex items-center justify-between gap-1">
            Paliers d&apos;équipe <span className="text-gray-400" aria-hidden="true">→</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
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
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:border-brand-red/40 transition-colors"
        >
          <p className="text-xl mb-1" aria-hidden="true">🏆</p>
          <p className="font-bold text-gray-900 text-sm flex items-center justify-between gap-1">
            Classement <span className="text-gray-400" aria-hidden="true">→</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {hasTeam && teamRank > 0 ? `#${teamRank} sur ${teamCount}` : "Découvre les équipes"}
          </p>
        </Link>

        <Link
          href={r("/feedback")}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:border-brand-red/40 transition-colors"
        >
          <p className="text-xl mb-1" aria-hidden="true">💬</p>
          <p className="font-bold text-gray-900 text-sm flex items-center justify-between gap-1">
            Mon resto <span className="text-gray-400" aria-hidden="true">→</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {validCount >= FEEDBACK_ELIGIBILITY_MIN
              ? "Encourage ou signale, en privé"
              : `Encore ${FEEDBACK_ELIGIBILITY_MIN - validCount} commande${FEEDBACK_ELIGIBILITY_MIN - validCount > 1 ? "s" : ""} pour donner ton avis`}
          </p>
        </Link>

        <Link
          href={r("/reserve")}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:border-brand-gold/60 transition-colors"
        >
          <p className="text-xl mb-1" aria-hidden="true">💰</p>
          <p className="font-bold text-gray-900 text-sm flex items-center justify-between gap-1">
            Ma réserve <span className="text-gray-400" aria-hidden="true">→</span>
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {reserveBalance > 0
              ? `${reserveBalance} de côté`
              : (saverTierCount ?? 0) > 0
                ? "Mets tes cadeaux de côté pour viser plus gros"
                : "Mets tes cadeaux de côté"}
          </p>
        </Link>
      </div>

      {/* ── SECTION 3 — Stats perso (subtil, bas de page) ─────────────────── */}
      {memberActive && (
        <p className="text-center text-xs text-gray-500 py-1">
          {validCount} commande{validCount > 1 ? "s" : ""} validée{validCount > 1 ? "s" : ""}
          {" · "}
          {totalPoints.toLocaleString("fr-BE")} pts gagnés
          {(redeemedCount ?? 0) > 0 && (
            <> · {redeemedCount} cadeau{(redeemedCount ?? 0) > 1 ? "x" : ""} récupéré{(redeemedCount ?? 0) > 1 ? "s" : ""}</>
          )}
        </p>
      )}

      {/* Commandes récentes */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-900">Mes commandes</h3>
          <Link href={r("/submit-order")} className="text-brand-red text-sm font-semibold hover:underline min-h-[44px] inline-flex items-center px-2">
            + Scanner un ticket
          </Link>
        </div>

        {orderList.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-500 text-sm">Aucun ticket scanné pour l&apos;instant.</p>
            <Link
              href={r("/submit-order")}
              className="inline-flex items-center mt-3 bg-brand-red text-white px-5 py-3 min-h-[48px] rounded-lg text-sm font-semibold hover:bg-brand-red/85 transition-colors"
            >
              Scanner mon premier ticket
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {orderList.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className={`font-medium text-sm ${order.status === "validated" ? "text-gray-900" : "text-gray-500"}`}>
                    {order.status === "validated"
                      ? `+${pointsForOrder(Number(order.amount))} pts`
                      : order.status === "pending" ? "En validation…" : "Non validée"}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {order.order_number ?? new Date(order.order_date).toLocaleDateString("fr-BE")}
                  </p>
                  {order.rejection_reason && <p className="text-sm text-red-600 mt-0.5">{order.rejection_reason}</p>}
                </div>
                <StatusBadge status={order.status} />
              </div>
            ))}
          </div>
        )}
      </div>

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
