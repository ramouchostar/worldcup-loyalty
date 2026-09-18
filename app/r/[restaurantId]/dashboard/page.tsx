import { redirect } from "next/navigation";
import Link from "next/link";
import { Camera, Coins, Gift, Lightbulb, MessageCircle, Share2, Trophy, UtensilsCrossed } from "lucide-react";
import { PEOPLE_EMOJI } from "@/lib/fluent-emoji";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantId, isRestaurantOwner } from "@/lib/restaurant";
import { loadRewardGrid, resolveCommunityBonus } from "@/lib/rewards";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getBudgetStatus } from "@/lib/budget";
import { recordFunnelStep } from "@/lib/funnel";
import { getPointsSummary, listCatalogue } from "@/lib/points";
import { catalogueView, personalPointsForOrder } from "@/lib/catalogue";
import { menuImageUrl } from "@/lib/menu-images";
import { getTeamsHidden } from "@/lib/teams";
import { FEEDBACK_ELIGIBILITY_MIN } from "@/lib/feedback";
import { ScoreCard } from "@/components/member/ScoreCard";
import { InstallAppCard } from "@/components/InstallAppCard";
import { TokensLine } from "@/components/member/TokensLine";
import { foodIconUrl } from "@/lib/food-icon";
import type { Order, PendingReward } from "@/types";
import { RedeemButton } from "@/app/r/[restaurantId]/my-rewards/RedeemButton";
import { ChooseButton } from "@/app/r/[restaurantId]/points/ChooseButton";
import { claimDeadline, claimOpensAt, isClaimNotYetOpen, redemptionRule } from "@/lib/reward-window";

// ADR 0059 — l'accueil membre répond à trois questions, dans l'ordre, sans
// faire défiler : qu'est-ce que j'ai (un cadeau qui attend, et le choix
// récupérer / mettre de côté), qu'est-ce que je peux viser (ce que rapporte
// le prochain ticket, la réserve), qu'est-ce que je fais (la photo). Le reste
// (jetons, installation, équipe, tuiles, historique) vient ensuite, en
// compact. Remplace l'ordre des ADR 0010 et 0030 §4.

type MembershipWithTeam = {
  team_id: string | null;
  teams: { name: string; flag_emoji: string } | null;
};

// Cadeau disponible, colonnes explicites : jamais les *_cost (ADR 0007).
// `orders.amount` sert au crédit de réserve affiché avant « Mettre de côté ».
type AvailableReward = Pick<PendingReward, "id" | "order_id" | "solo_item" | "community_item" | "advancement_item" | "created_at" | "source"> & {
  orders: { amount: number } | null;
};

export default async function DashboardPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const r = (path: string) => `/r/${restaurantId}${path}`;

  // Entonnoir (ADR 0037) — dernier étage : le membre est arrivé chez lui.
  // Attendu : une promesse flottante dans un composant serveur peut être
  // coupée à la fin du rendu.
  await recordFunnelStep(restaurantId, "home_viewed");

  const admin = createAdminClient();
  const [
    { data: membershipRaw },
    { data: orders },
    { data: availableRaw },
    { count: redeemedCount },
    { count: validatedOrderCount },
    grid,
    isOwnerOfCurrent,
    { data: profileFlags },
    teamsHidden,
    pointsSummary,
    catalogue,
  ] = await Promise.all([
    supabase
      .from("memberships")
      .select("team_id, teams(name, flag_emoji)")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, amount, order_date, status, rejection_reason")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabase
      .from("pending_rewards")
      .select("id, order_id, solo_item, community_item, advancement_item, created_at, source, orders(amount)")
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
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated"),
    loadRewardGrid(restaurantId),
    isRestaurantOwner(user.id, restaurantId),
    supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
    // Réglage par établissement (kraainem) : compétition masquée — ni
    // comparaison au classement, ni tuile Classement. L'équipe reste.
    getTeamsHidden(restaurantId),
    // « Mes points » (ADR 0061) : le solde qui s'échange, et le catalogue.
    getPointsSummary(user.id, restaurantId),
    listCatalogue(restaurantId),
  ]);

  // Carte gérant (ADR 0030 §2) — owner de CE resto ou admin legacy sur le
  // resto par défaut. Pas le super-admin (il a son entrée Plateforme).
  const isManager =
    isOwnerOfCurrent ||
    (!!(profileFlags as { is_admin: boolean } | null)?.is_admin && restaurantId === getRestaurantId());

  const membership = membershipRaw as unknown as MembershipWithTeam | null;
  const team = membership?.teams ?? null;
  const hasTeam = !!membership?.team_id;
  const validCount = validatedOrderCount ?? 0;
  const orderList = (orders as Order[] | null) ?? [];

  // ── Ce que j'ai : le cadeau qui attend (un seul actif, ADR 0011) ────────────
  const available = (availableRaw as unknown as AvailableReward[] | null) ?? [];
  const gift = available[0] ?? null;
  // ADR 0011 amendé — un cadeau de ticket s'ouvre 4 h après le ticket (jamais
  // pendant la même visite), puis reste 48 h (lib/reward-window).
  const giftOpensAt = gift ? claimOpensAt(gift.created_at, gift.source) : null;
  const giftLocked = gift ? isClaimNotYetOpen(gift.created_at, gift.source) : false;
  const giftExpiresAt = gift ? claimDeadline(gift.created_at, gift.source) : null;
  const giftHoursLeft = giftExpiresAt ? Math.max(0, Math.floor((giftExpiresAt.getTime() - Date.now()) / 3_600_000)) : 0;

  // ── Ce que je peux viser : le prochain ticket, la réserve ───────────────────
  // ADR 0061 §5 — ce que les points permettent déjà, ou ce qui manque.
  const pointsGoal = catalogueView(pointsSummary.available, catalogue);
  const showPoints = catalogue.length > 0 || pointsSummary.available + pointsSummary.pending > 0;

  // ── Équipe (établissements qui l'utilisent) ─────────────────────────────────
  // Score et rang : colonnes publiques uniquement (m41). La dépense cumulée
  // (euros, service role) ne sert qu'à résoudre le palier réellement
  // finançable (ADR 0017) — jamais rendue (ADR 0007).
  type RankRow = { team_id: string; score: number; teams: { name: string; flag_emoji: string; is_active: boolean } | null };
  const [scoreResult, spentResult, rankResult, restaurantUnlocked, budget] = hasTeam
    ? await Promise.all([
        supabase.from("community_scores").select("member_count, score").eq("team_id", membership!.team_id!).eq("restaurant_id", restaurantId).single(),
        admin.from("community_scores").select("total_spent").eq("team_id", membership!.team_id!).eq("restaurant_id", restaurantId).single(),
        supabase.from("community_scores").select("team_id, score, teams(name, flag_emoji, is_active)").eq("restaurant_id", restaurantId).order("score", { ascending: false }),
        isRestaurantThresholdUnlocked(restaurantId),
        getBudgetStatus(restaurantId),
      ])
    : [null, null, null, false, null];

  const score = (scoreResult?.data as { score: number } | null)?.score ?? 0;
  const memberCount = (scoreResult?.data as { member_count: number } | null)?.member_count ?? 0;
  const teamTotalSpent = Number((spentResult?.data as { total_spent: number } | null)?.total_spent ?? 0);
  const rankRows = ((rankResult?.data as unknown as RankRow[] | null) ?? []).filter((row) => row.teams?.is_active);
  const teamRank = hasTeam ? rankRows.findIndex((row) => row.team_id === membership!.team_id) + 1 : 0;
  const teamCount = rankRows.length;
  const leaderRow = teamRank > 1 ? rankRows[0] : null;
  const communityBonusActive = budget?.communityBonusActive ?? false;
  const communityTiers = grid.community.map((t) => ({ score: t.min, item: t.item }));
  const nextTier = communityTiers.find((t) => t.score > score) ?? null;
  const prevTierScore = nextTier ? (communityTiers[communityTiers.indexOf(nextTier) - 1]?.score ?? 0) : 0;
  const tierPct = nextTier
    ? Math.min(100, Math.round(((score - prevTierScore) / (nextTier.score - prevTierScore)) * 100))
    : 100;
  const isWeakCommunity = communityTiers.length > 0 && score < communityTiers[0].score;
  const financedCommunity = hasTeam && budget
    ? resolveCommunityBonus(grid, score, restaurantUnlocked && communityBonusActive, {
        memberCount,
        teamTotalSpent,
        budgetPct: budget.budgetPct,
      })
    : { item: null };

  // ADR 0061 §5 — la carte « Mes points » : en haut quand aucun cadeau
  // n'attend (« qu'est-ce que je peux viser », ADR 0059), sous la photo sinon.
  const pointsCard = showPoints ? (
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-bold text-gray-900">
            <Coins className="w-5 h-5 shrink-0 text-gray-700" aria-hidden="true" />
            Mes points
          </p>
          <p className="text-2xl font-black text-gray-900 tabular-nums">{pointsSummary.available.toLocaleString("fr-BE")}</p>
        </div>
        {pointsSummary.pending > 0 && (
          <p className="text-xs text-gray-500 text-right">+{pointsSummary.pending.toLocaleString("fr-BE")} en attente</p>
        )}

        {pointsGoal.reachable && !gift && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-green-50 border border-green-200 p-3">
            <div className="flex items-center gap-2 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={menuImageUrl(pointsGoal.reachable.imagePath) ?? foodIconUrl(pointsGoal.reachable.name)}
                alt=""
                aria-hidden="true"
                className={pointsGoal.reachable.imagePath ? "w-10 h-10 shrink-0 rounded-lg object-cover" : "w-8 h-8 shrink-0"}
              />
              <div className="min-w-0">
                <p className="text-xs text-green-800">Tu peux déjà avoir</p>
                <p className="font-bold text-gray-900 text-sm truncate">{pointsGoal.reachable.name}</p>
              </div>
            </div>
            <div className="w-24 shrink-0">
              <ChooseButton itemId={pointsGoal.reachable.id} itemName={pointsGoal.reachable.name} price={pointsGoal.reachable.pricePoints} />
            </div>
          </div>
        )}

        {pointsGoal.next && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mb-1.5">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foodIconUrl(pointsGoal.next.name)} alt="" aria-hidden="true" className="w-5 h-5 shrink-0" />
                <span className="truncate">
                  Plus que <span className="font-semibold text-gray-700">{pointsGoal.missing.toLocaleString("fr-BE")} points</span> pour{" "}
                  <span className="font-semibold text-gray-700">{pointsGoal.next.name}</span>
                </span>
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${Math.max(pointsGoal.pct, 3)}%` }} />
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-3">
          Chaque ticket te rapporte des points.{" "}
          <Link href={r("/points")} className="font-semibold text-gray-700 underline">
            Voir le catalogue
          </Link>
        </p>
      </section>
  ) : null;

  return (
    <div className="space-y-4 pb-4">
      {/* ── Carte gérant (ADR 0030 §2) ─────────────────────────────────────── */}
      {isManager && (
        <Link
          href={`/admin/${restaurantId}`}
          className="flex items-center justify-between bg-brand-dark text-white rounded-2xl p-4 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="w-6 h-6 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold text-sm">Vous êtes le gérant de ce restaurant</p>
              <p className="text-xs text-gray-400">Commandes, ventes, broadcasts, réglages…</p>
            </div>
          </div>
          <span className="text-brand-gold font-semibold text-sm shrink-0">Console →</span>
        </Link>
      )}

      {gift ? (
        // ── Ce que j'ai — le cadeau qui attend ──────────────────────────────
        // Vert fixe, comme la carte de gain (ADR 0048) : brand-gold résout en
        // rouge chez Kraainem, lu comme une alerte sur une bonne nouvelle.
        <section className="rounded-2xl border-2 border-green-200 bg-green-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-green-800 text-center">
            {giftLocked ? "Ton cadeau t'attend à ta prochaine visite" : "Ton cadeau t'attend au comptoir"}
          </p>
          {gift.solo_item && (
            <div className="flex flex-col items-center mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foodIconUrl(gift.solo_item)} alt="" aria-hidden="true" className="w-20 h-20 drop-shadow" />
              <p className="text-2xl font-black text-gray-900 text-center mt-1">{gift.solo_item}</p>
            </div>
          )}
          {(gift.community_item || gift.advancement_item) && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
              {[gift.community_item, gift.advancement_item].filter(Boolean).map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foodIconUrl(item!)} alt="" aria-hidden="true" className="w-5 h-5" />+ {item}
                </span>
              ))}
            </div>
          )}
          <p className={`text-center text-xs font-semibold mt-3 ${giftHoursLeft <= 6 ? "text-red-700" : "text-green-800"}`}>
            {giftHoursLeft <= 0
              ? "Expire très bientôt !"
              : giftHoursLeft <= 6
                ? `Plus que ${giftHoursLeft} h pour le récupérer`
                : `À récupérer avant le ${giftExpiresAt!.toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" })} à ${giftExpiresAt!.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" })}`}
          </p>
          {/* ADR 0011 amendé — la règle de retrait, écrite (exception ADR 0007). */}
          <p className="text-center text-xs text-gray-700 mt-1">{redemptionRule(gift.source)}</p>
          <div className="mt-4 space-y-2">
            <RedeemButton size="lg" opensAt={giftOpensAt!.toISOString()} />
          </div>
          {/* ADR 0011 — un seul cadeau actif : sans cette phrase, le membre
              enchaîne des tickets en croyant cumuler des cadeaux. */}
          <p className="text-xs text-gray-600 text-center mt-3">
            Tant qu&apos;il t&apos;attend, tes prochains tickets ne créent pas de nouveau cadeau.
          </p>
          {available.length > 1 && (
            <Link href={r("/my-rewards")} className="block text-center text-xs font-semibold text-green-800 underline mt-2">
              {available.length - 1} autre{available.length > 2 ? "s" : ""} cadeau{available.length > 2 ? "x" : ""} dans Mes cadeaux
            </Link>
          )}
        </section>
      ) : (
        // ── Ce que je peux viser — mes points (ADR 0061 §5) ─────────────────
        // Plus de cadeau imposé par ticket : ce que les points permettent déjà,
        // ou ce qui manque, au catalogue. Jamais de seuil ni d'euro.
        pointsCard ?? (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-500 text-center">Chaque ticket te rapporte des points</p>
            <p className="text-lg font-black text-gray-900 text-center mt-2">Choisis ton cadeau au catalogue</p>
          </section>
        )
      )}

      {/* ── Ce que je fais — la photo, l'action la plus rentable ──────────── */}
      <Link
        href={r("/submit-order")}
        className="flex items-center justify-center gap-3 w-full bg-brand-red text-white py-5 rounded-2xl text-lg font-black shadow-lg hover:bg-brand-red/85 transition-colors"
      >
        <Camera className="w-6 h-6 shrink-0" strokeWidth={2.5} aria-hidden="true" />
        Prendre mon ticket en photo
      </Link>

      {/* ── Mes points (ADR 0061) — sous la photo quand un cadeau occupe le haut ── */}
      {gift && pointsCard}

      {/* ── Un cadeau en plus : les jetons, en une ligne ─────────────────── */}
      <TokensLine />

      {/* ADR 0038 — l'installation reste proposée, mais après ce que le membre
          est venu chercher (ADR 0059) ; disparaît une fois l'app installée. */}
      <InstallAppCard audience="membre" surface="dashboard_membre" />

      {/* ── Équipe — toujours : l'appartenance sert la diffusion ciblée du
          restaurateur. Seule la comparaison au classement suit le réglage
          « équipes masquées » (ADR 0059 amendé, 2026-09-15). ─────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        {!team ? (
          <div id="tour-community-progress" className="p-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PEOPLE_EMOJI} alt="" className="w-12 h-12 mx-auto mb-2" />
            <p className="font-bold text-gray-900 mb-1">Pas encore d&apos;équipe</p>
            <p className="text-sm text-gray-500 mb-4">
              Rejoins une équipe : chaque ticket de l&apos;équipe peut ajouter un cadeau au tien.
            </p>
            <Link
              href={r("/my-team")}
              className="inline-block bg-brand-red text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-red/85 transition-colors"
            >
              Voir les équipes →
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
              {!communityBonusActive && (
                <div className="mb-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm">⏸️</span>
                  <p className="text-xs font-medium text-gray-600">
                    Le cadeau d&apos;équipe est en pause — ton cadeau à chaque ticket reste garanti.
                  </p>
                </div>
              )}

              {communityTiers.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-1">
                  Le score de ton équipe grandit à chaque ticket.
                </p>
              ) : nextTier ? (
                <>
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5 tabular-nums">
                    <span>{score.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts</span>
                    <span>vers {nextTier.score.toLocaleString("fr-BE")} pts</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-brand-red h-2 rounded-full transition-all duration-700" style={{ width: `${tierPct}%` }} />
                  </div>
                  <div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foodIconUrl(nextTier.item)} alt="" aria-hidden="true" className="w-7 h-7" />
                    <div>
                      <p className="text-xs text-gray-500">Quand ton équipe l&apos;atteint</p>
                      <p className="font-bold text-gray-900 text-sm">+ {nextTier.item} sur chaque ticket</p>
                    </div>
                  </div>
                  {isWeakCommunity ? (
                    <Link
                      href={r("/my-team")}
                      className="mt-3 flex items-center justify-center gap-2 w-full bg-green-500 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
                    >
                      <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" /> Inviter dans mon équipe
                    </Link>
                  ) : (
                    <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-2 text-center">
                      <Lightbulb className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Chaque ticket de ton équipe vous rapproche.
                    </p>
                  )}
                </>
              ) : (
                <div className="text-center py-1">
                  <Trophy className="w-6 h-6 mx-auto mb-1 text-green-700" aria-hidden="true" />
                  <p className="font-bold text-green-800 text-sm">Meilleur cadeau d&apos;équipe atteint !</p>
                  {/* Palier réellement finançable (couverture ADR 0017), message neutre (ADR 0007) */}
                  <p className="text-xs text-gray-500">
                    + {financedCommunity.item ?? communityTiers[communityTiers.length - 1].item} sur chaque ticket
                  </p>
                </div>
              )}
            </div>

            {/* Comparaison au classement — en points (ADR 0007), jamais
                score/membres (ADR 0028). Seule en lice → rien à comparer.
                Compétition masquée par l'établissement → rien non plus. */}
            {!teamsHidden && teamCount > 1 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {teamRank === 1 ? (
                  <p className="text-sm text-center text-gray-700">
                    🥇 <span className="font-bold text-orange-600">Ton équipe est en tête</span> avec{" "}
                    {score.toLocaleString("fr-BE")} pts !
                  </p>
                ) : (
                  <div className="space-y-2">
                    {leaderRow && (
                      <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                        <span className="text-lg shrink-0" aria-hidden="true">🥇</span>
                        <span className="text-xl shrink-0" aria-hidden="true">{leaderRow.teams?.flag_emoji}</span>
                        <p className="flex-1 min-w-0 font-semibold text-sm text-gray-900 truncate">{leaderRow.teams?.name}</p>
                        <p className="font-bold text-sm text-gray-900 tabular-nums shrink-0">{leaderRow.score.toLocaleString("fr-BE")} pts</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3 rounded-xl bg-orange-50 border border-orange-200 p-3">
                      <span className="text-xs font-bold text-orange-600 w-6 text-center shrink-0">#{teamRank}</span>
                      <span className="text-xl shrink-0" aria-hidden="true">{team.flag_emoji}</span>
                      <p className="flex-1 min-w-0 font-semibold text-sm text-orange-600 flex items-baseline gap-1">
                        <span className="truncate">{team.name}</span>
                        <span className="font-normal shrink-0">← toi</span>
                      </p>
                      <p className="font-bold text-sm text-gray-900 tabular-nums shrink-0">{score.toLocaleString("fr-BE")} pts</p>
                    </div>
                  </div>
                )}
                <Link href={r("/leaderboard")} className="block text-center text-xs font-semibold text-orange-600 mt-3 hover:underline">
                  Classement complet →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tuiles d'accès (ADR 0030 §4) — sans la tuile Classement quand
          l'établissement masque la compétition. « Ma réserve » est devenue
          une carte au-dessus (ADR 0059). */}
      <div className="grid grid-cols-2 gap-3">
        <Link href={r("/rewards")} className="rounded-xl bg-white border border-gray-100 p-4 hover:bg-gray-50 transition-colors">
          <Gift className="w-5 h-5 mb-1 text-gray-700" aria-hidden="true" />
          <p className="font-bold text-gray-900 text-sm">Cadeaux d&apos;équipe</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {!hasTeam
              ? "Rejoins une équipe"
              : (() => {
                  const unlocked = communityTiers.filter((t) => t.score <= score).length;
                  return unlocked > 0 ? `${unlocked} atteint${unlocked > 1 ? "s" : ""}` : "Découvre-les";
                })()}
          </p>
        </Link>
        {!teamsHidden && (
          <Link href={r("/leaderboard")} className="rounded-xl bg-white border border-gray-100 p-4 hover:bg-gray-50 transition-colors">
            <Trophy className="w-5 h-5 mb-1 text-gray-700" aria-hidden="true" />
            <p className="font-bold text-gray-900 text-sm">Classement</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {hasTeam && teamRank > 0 ? `#${teamRank} sur ${teamCount}` : "Découvre les équipes"}
            </p>
          </Link>
        )}
        <Link href={r("/feedback")} className="rounded-xl bg-white border border-gray-100 p-4 hover:bg-gray-50 transition-colors">
          <MessageCircle className="w-5 h-5 mb-1 text-gray-700" aria-hidden="true" />
          <p className="font-bold text-gray-900 text-sm">Mon resto</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {validCount >= FEEDBACK_ELIGIBILITY_MIN
              ? "Encourage ou signale, en privé"
              : `Encore ${FEEDBACK_ELIGIBILITY_MIN - validCount} ticket${FEEDBACK_ELIGIBILITY_MIN - validCount > 1 ? "s" : ""} pour donner ton avis`}
          </p>
        </Link>
      </div>

      {/* ── Mes tickets — points gagnés et statut, sans le numéro de commande ── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-900">Mes tickets</h3>
          <Link href={r("/submit-order")} className="text-brand-red text-sm font-semibold hover:underline">
            + Ajouter
          </Link>
        </div>
        {orderList.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Aucun ticket pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {orderList.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className={`font-medium text-sm ${order.status === "validated" ? "text-gray-900" : "text-gray-400"}`}>
                    {order.status === "validated"
                      ? `+${personalPointsForOrder(Number(order.amount))} points`
                      : order.status === "pending" ? "En vérification…" : "Non validé"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(order.order_date).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}
                  </p>
                  {order.rejection_reason && <p className="text-xs text-red-500 mt-0.5">{order.rejection_reason}</p>}
                </div>
                <StatusBadge status={order.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      {validCount > 0 && (
        <p className="text-center text-xs text-gray-400 py-1">
          {validCount} ticket{validCount > 1 ? "s" : ""} validé{validCount > 1 ? "s" : ""}
          {(redeemedCount ?? 0) > 0 && (
            <> · {redeemedCount} cadeau{(redeemedCount ?? 0) > 1 ? "x" : ""} récupéré{(redeemedCount ?? 0) > 1 ? "s" : ""}</>
          )}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: "bg-amber-100 text-amber-800", label: "En attente" },
    validated: { cls: "bg-green-100 text-green-800", label: "Validé" },
    rejected: { cls: "bg-red-100 text-red-800", label: "Refusé" },
  };
  const { cls, label } = map[status] ?? map.pending;
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${cls}`}>{label}</span>;
}
