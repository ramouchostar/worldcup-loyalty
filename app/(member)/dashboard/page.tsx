import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getSoloReward, getCommunityBonus, getAdvancementBonus } from "@/lib/rewards";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getBudgetStatus } from "@/lib/budget";
import { getRestaurantId } from "@/lib/restaurant";
import { applyRoundBonus } from "@/lib/score";
import { ScoreCard } from "@/components/member/ScoreCard";
import { OnboardingFlow } from "@/components/member/OnboardingFlow";
import type { Order, PendingReward } from "@/types";
import { RedeemButton } from "@/app/(member)/my-rewards/RedeemButton";

type ProfileWithTeam = {
  display_name: string;
  team_id: string;
  teams: {
    name: string;
    flag_emoji: string;
    is_active: boolean;
    round_reached: string;
    eliminated_at: string | null;
    round_advanced_at: string | null;
  };
};

const COMMUNITY_TIERS = [
  { score: 1000,  item: "Frites Medium" },
  { score: 3000,  item: "Churros 12 pcs" },
  { score: 6000,  item: "Finest burger" },
  { score: 10000, item: "Menu 4 Tenders" },
];

const TOURNAMENT_ROUNDS = [
  { key: "group_stage",   label: "Groupes" },
  { key: "round_of_32",   label: "1/32" },
  { key: "round_of_16",   label: "1/8" },
  { key: "quarter_final", label: "1/4" },
  { key: "semi_final",    label: "1/2" },
  { key: "final",         label: "Finale" },
];

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurantId = getRestaurantId();

  const [
    { data: profileRaw },
    { data: orders },
    { data: pendingRaw },
    { count: redeemedCount },
    restaurantUnlocked,
    budget,
    { data: validatedOrdersData, count: validatedOrderCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, team_id, teams(name, flag_emoji, is_active, round_reached, eliminated_at, round_advanced_at)")
      .eq("id", user.id)
      .single(),
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
    isRestaurantThresholdUnlocked(),
    getBudgetStatus(restaurantId),
    supabase
      .from("orders")
      .select("amount", { count: "exact" })
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated"),
  ]);

  const profile = profileRaw as unknown as ProfileWithTeam | null;
  if (!profile?.team_id) redirect("/register");

  const { data: scoreRaw } = await supabase
    .from("community_scores")
    .select("team_id, member_count, score")
    .eq("team_id", profile.team_id)
    .eq("restaurant_id", restaurantId)
    .single();

  const rawScore       = (scoreRaw as { score: number } | null)?.score ?? 0;
  const memberCount    = (scoreRaw as { member_count: number } | null)?.member_count ?? 0;
  const pendingRewards = (pendingRaw as PendingReward[] ?? []);
  const orderList      = (orders as Order[] ?? []);
  const team           = profile.teams;

  // Apply ×1.5 round-advancement bonus to display score (ADR 0002)
  const displayScore    = applyRoundBonus(rawScore, team.round_advanced_at ?? null);
  const roundBonusActive = displayScore !== rawScore;

  // ── Hero preview (ADR 0010) ────────────────────────────────────────────────
  const totalSpent  = (validatedOrdersData ?? []).reduce((s, o) => s + Number((o as { amount: number }).amount), 0);
  const validCount  = validatedOrderCount ?? 0;
  const memberActive = validCount > 0;
  const avgAmount   = validCount > 0 ? totalSpent / validCount : 25;
  const previewAmt  = Math.max(15, Math.round(avgAmount));

  // Plafond budget (ADR 0012) : couches 2 et 3 masquées si en pause —
  // seule la valeur booléenne sert au rendu, jamais les montants
  const heroSolo        = getSoloReward(previewAmt);
  const heroCommunity   = getCommunityBonus(displayScore, restaurantUnlocked && budget.communityBonusActive);
  const heroAdvancement = budget.communityBonusActive
    ? getAdvancementBonus(team.round_reached, !team.is_active)
    : { item: null, cost: 0 };
  const heroCount       = [heroSolo.item, heroCommunity.item, heroAdvancement.item].filter(Boolean).length;

  // ── Community progress (ADR 0010 section 2) ───────────────────────────────
  const isWeakCommunity = displayScore < COMMUNITY_TIERS[0].score;
  const nextTier       = COMMUNITY_TIERS.find(t => t.score > displayScore) ?? null;
  const prevTierScore  = nextTier ? (COMMUNITY_TIERS[COMMUNITY_TIERS.indexOf(nextTier) - 1]?.score ?? 0) : 0;
  const tierPct        = nextTier
    ? Math.min(100, Math.round(((displayScore - prevTierScore) / (nextTier.score - prevTierScore)) * 100))
    : 100;

  // ── Tournament path (ADR 0010 section 3) ──────────────────────────────────
  const roundKeys      = TOURNAMENT_ROUNDS.map(r => r.key);
  const teamRoundIdx   = roundKeys.indexOf(team.round_reached);
  const isEliminated   = !team.is_active;
  const isWinner       = team.round_reached === "winner";

  return (
    <div className="space-y-5 pb-4">
      <OnboardingFlow />

      {/* ── SECTION 1 — Hero preview ───────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-brand-dark to-gray-800 rounded-2xl p-5 text-white">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">🎁 Ta prochaine commande</p>
        <p className="text-xs text-gray-500 mb-4">Pour une commande de ~€{previewAmt} :</p>

        <div className="space-y-3">
          {heroSolo.item ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🍗</span>
                <span className="font-bold">{heroSolo.item}</span>
              </div>
              <span className="text-xs text-gray-400">← ton cadeau de base</span>
            </div>
          ) : (
            <div className="flex items-center justify-between opacity-40">
              <span className="text-sm text-gray-400">Aucun cadeau solo (commande ≥ €15)</span>
            </div>
          )}

          {heroCommunity.item && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>👥</span>
                <span className="font-bold text-brand-gold">+ {heroCommunity.item}</span>
              </div>
              <span className="text-xs text-gray-400">← {team.flag_emoji} force de ta communauté</span>
            </div>
          )}

          {heroAdvancement.item && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>⚽</span>
                <span className="font-bold text-brand-gold">+ {heroAdvancement.item}</span>
              </div>
              <span className="text-xs text-gray-400">← {team.flag_emoji} {team.name} avance</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
          <p className="text-sm text-gray-300">
            {heroCount > 0
              ? `${heroCount} cadeau${heroCount > 1 ? "x" : ""} t'attend${heroCount > 1 ? "ent" : ""} au comptoir`
              : "Commande ≥ €15 pour débloquer"}
          </p>
          <Link
            href="/submit-order"
            className="bg-brand-red text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors shrink-0"
          >
            Commander →
          </Link>
        </div>
      </div>

      {/* Récompenses à récupérer au comptoir */}
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
            <Link href="/my-rewards" className="text-xs text-gray-400 hover:text-gray-600 underline">
              Historique →
            </Link>
          </div>
          <div className="space-y-4">
            {pendingRewards.map((r, idx) => (
              <div key={r.id} className={idx > 0 ? "pt-3 border-t border-brand-gold/20" : ""}>
                {pendingRewards.length > 1 && (
                  <p className="text-xs text-gray-400 mb-1.5">Commande {pendingRewards.length - idx}</p>
                )}
                <div className="space-y-1.5">
                  {r.solo_item && (
                    <div className="flex items-center gap-2">
                      <span>🍗</span>
                      <span className="font-bold text-gray-900">{r.solo_item}</span>
                      <span className="text-xs text-gray-400 ml-auto">cadeau de base</span>
                    </div>
                  )}
                  {r.community_item && (
                    <div className="flex items-center gap-2">
                      <span>👥</span>
                      <span className="font-bold text-gray-900">+ {r.community_item}</span>
                      <span className="text-xs text-gray-400 ml-auto">bonus communautaire</span>
                    </div>
                  )}
                  {r.advancement_item && (
                    <div className="flex items-center gap-2">
                      <span>⚽</span>
                      <span className="font-bold text-gray-900">+ {r.advancement_item}</span>
                      <span className="text-xs text-gray-400 ml-auto">avancement</span>
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
              <p className="text-xs text-amber-600 font-medium mt-0.5">
                ⏰ 48h pour récupérer avant expiration
              </p>
            </div>
            <RedeemButton />
          </div>
        </div>
      )}

      {/* ── SECTION 2 — Community progress ────────────────────────────────── */}
      <div id="tour-community-progress" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">{team.flag_emoji}</span>
          <p className="font-bold text-gray-900">Communauté {team.name}</p>
        </div>

        <ScoreCard
          teamId={profile.team_id}
          initial={{ team_id: profile.team_id, member_count: memberCount, score: displayScore }}
        />

        <div className="mt-4 pt-4 border-t border-gray-100">
          {/* Bonus ×1.5 active badge (ADR 0002) */}
          {roundBonusActive && (
            <div className="mb-3 flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/30 rounded-lg px-3 py-2">
              <span className="text-sm">⚡</span>
              <p className="text-xs font-semibold text-amber-800">
                Bonus ×1.5 actif — votre équipe vient de passer un tour !
              </p>
            </div>
          )}

          {/* Plafond budget atteint (ADR 0012) — message neutre, jamais la
              vraie raison (ADR 0007) */}
          {!budget.communityBonusActive && (
            <div className="mb-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-sm">⏸️</span>
              <p className="text-xs font-medium text-gray-600">
                Bonus communautaire en pause — ton cadeau de base reste garanti à chaque commande.
              </p>
            </div>
          )}

          {nextTier ? (
            <>
              <div className="flex justify-between text-xs text-gray-400 mb-1.5 tabular-nums">
                <span>{displayScore.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts</span>
                <span>vers {nextTier.score.toLocaleString("fr-BE")} pts</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-brand-red h-2 rounded-full transition-all duration-700"
                  style={{ width: `${tierPct}%` }}
                />
              </div>

              {/* Weak community CTA (ADR 0010) */}
              {isWeakCommunity ? (
                <div className="mt-3 space-y-2">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <p className="text-sm font-semibold text-blue-900">
                      À{" "}
                      {(nextTier.score - displayScore).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}{" "}
                      pts du 1er bonus communautaire
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Chaque commande de tes amis vous rapproche du bonus&nbsp;
                      <span className="font-semibold">+ {nextTier.item}</span>.
                    </p>
                  </div>
                  <Link
                    href="/parrainage"
                    className="flex items-center justify-center gap-2 w-full bg-green-500 text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
                  >
                    <span>📲</span> Inviter des amis via WhatsApp
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
                    💡 Chaque commande directe de ta communauté vous rapproche.
                  </p>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-1">
              <p className="text-2xl mb-1">🏆</p>
              <p className="font-bold text-green-800 text-sm">Bonus maximum atteint !</p>
              <p className="text-xs text-gray-500">+ Menu 4 Tenders sur chaque commande</p>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 3 — World Cup card ─────────────────────────────────────── */}
      {isEliminated ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
          <span className="text-2xl">🔴</span>
          <div className="flex-1">
            <p className="font-bold text-red-900">{team.flag_emoji} {team.name} est éliminée</p>
            <p className="text-red-700 text-sm mt-1">
              Ton bonus d&apos;avancement n&apos;est plus actif.
            </p>
            <Link
              href="/transfer"
              className="inline-block mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Changer de communauté →
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-4">
            ⚽ {team.name} dans le tournoi
          </p>

          {isWinner ? (
            <div className="text-center py-2">
              <p className="text-4xl mb-2">🏆</p>
              <p className="font-bold text-yellow-600">Champion du monde !</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4">
                {TOURNAMENT_ROUNDS.map((round, idx) => {
                  const passed  = idx < teamRoundIdx;
                  const current = idx === teamRoundIdx;
                  return (
                    <div key={round.key} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-base leading-none">
                        {passed ? "✅" : current ? "📍" : "○"}
                      </span>
                      <span className={`text-xs text-center leading-tight ${
                        current ? "font-bold text-brand-red" :
                        passed  ? "text-gray-500" : "text-gray-300"
                      }`}>
                        {round.label}
                      </span>
                    </div>
                  );
                })}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-base leading-none">⭐</span>
                  <span className="text-xs text-gray-300">★</span>
                </div>
              </div>

              {heroAdvancement.item ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-green-900">
                    Tant que {team.name} avance, chaque commande directe débloque{" "}
                    <span className="text-green-700">+ {heroAdvancement.item}</span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center">
                  Le bonus d&apos;avancement s&apos;active au prochain tour qualifié.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SECTION 4 — Personal stats (subtle, bas de page) ──────────────── */}
      {memberActive && (
        <p className="text-center text-xs text-gray-400 py-1">
          {validCount} commande{validCount > 1 ? "s" : ""} validée{validCount > 1 ? "s" : ""}
          {" · "}
          {totalSpent.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} dépensés
          {(redeemedCount ?? 0) > 0 && (
            <> · {redeemedCount} cadeau{(redeemedCount ?? 0) > 1 ? "x" : ""} récupéré{(redeemedCount ?? 0) > 1 ? "s" : ""}</>
          )}
        </p>
      )}

      {/* Commandes récentes */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-900">Mes commandes</h3>
          <Link href="/submit-order" className="text-brand-red text-sm font-semibold hover:underline">
            + Ajouter
          </Link>
        </div>

        {orderList.length === 0 ? (
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
            {orderList.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {Number(order.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {order.order_number ?? new Date(order.order_date).toLocaleDateString("fr-BE")}
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

      <p className="text-center text-xs text-gray-300 pb-2">Score mis à jour toutes les 30 secondes</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:   { cls: "bg-amber-100 text-amber-800", label: "En attente" },
    validated: { cls: "bg-green-100 text-green-800", label: "Validée ✓" },
    rejected:  { cls: "bg-red-100 text-red-800",     label: "Rejetée" },
  };
  const { cls, label } = map[status] ?? map.pending;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${cls}`}>
      {label}
    </span>
  );
}
