"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { ACTION_BUTTON_LABELS, ACTION_ORDER, TOKENS_PER_PORTION, getActionLinks, getSocialHandle } from "@/lib/social-actions";
import type { MicroReward, MicroRewardClaim, MicroRewardType } from "@/types";

// « Je le ferai plus tard » : snooze local (par device), même convention que
// OnboardingFlow — pas de colonne serveur, ça reviendra dans 24h. Doublé
// d'une trace serveur (micro_reward_postpones) qui alimente un rappel à J+7
// (ADR 0024) si toujours pas soumis.
const POSTPONE_PREFIX = "action_cards_postponed_";
const SNOOZE_24H = 24 * 60 * 60 * 1000;

function loadPostponed(restaurantId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(POSTPONE_PREFIX + restaurantId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Vue « échelle » — remplace l'ancienne ActionCardsSection (une seule action
// à la fois) par le parcours complet : fait (✓), en cours (bouton), à venir
// (numéro grisé), plus le bonus d'équipe en dernière marche. Une action
// validée disparaît de la liste pour toujours (pas de re-proposition) ; une
// action reportée redevient "en cours" après son snooze, sans intervention.
//
// Le nom du cadeau (jetonsGift, ADR 0017) est affiché dès le départ — pas
// juste "portion offerte" — et le compte de jetons inclut le parrainage
// (5 inscrits = 1 jeton, même formule que app/r/[restaurantId]/micro-rewards),
// pas seulement les actions sociales : sinon le "X/4" affiché ici pourrait ne
// pas correspondre à celui de l'onglet Actions.
export function ActionsLadder({
  nextCommunityItem,
  nextCommunityScore,
}: {
  nextCommunityItem: string | null;
  nextCommunityScore: number | null;
}) {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const restaurant = useRestaurantInfo();
  const [rewards, setRewards] = useState<MicroReward[] | null>(null);
  const [claims, setClaims] = useState<MicroRewardClaim[]>([]);
  const [giftName, setGiftName] = useState("Cadeau surprise");
  const [referralValidated, setReferralValidated] = useState(0);
  const [postponed, setPostponed] = useState<Record<string, number>>({});
  const [busyType, setBusyType] = useState<MicroRewardType | null>(null);

  useEffect(() => {
    setPostponed(loadPostponed(restaurantId));
    fetchData();
  }, []);

  async function fetchData() {
    const [socialRes, refRes] = await Promise.all([
      fetch(`/api/micro-rewards?restaurantId=${restaurantId}`),
      fetch(`/api/referrals?restaurantId=${restaurantId}`),
    ]);
    if (socialRes.ok) {
      const data = await socialRes.json();
      setRewards(data.rewards ?? []);
      setClaims(data.claims ?? []);
      if (data.giftName) setGiftName(data.giftName);
    }
    if (refRes.ok) {
      const data = await refRes.json();
      setReferralValidated(data.validatedCount ?? 0);
    }
  }

  if (rewards === null) return null;

  const links = getActionLinks(restaurant, restaurantId);
  const claimMap = Object.fromEntries(claims.map((c) => [c.reward_type, c])) as Record<
    string,
    MicroRewardClaim
  >;

  const eligible = rewards
    .filter((r) => links[r.type])
    .sort((a, b) => ACTION_ORDER.indexOf(a.type) - ACTION_ORDER.indexOf(b.type));

  const hasEligible = eligible.length > 0;
  const allSocialDone =
    hasEligible && eligible.every((r) => claimMap[r.type]?.status === "validated");
  const showRungs = hasEligible && !allSocialDone;

  if (!hasEligible && !nextCommunityItem) return null;

  const socialValidated = eligible.filter((r) => claimMap[r.type]?.status === "validated").length;
  const referralTokens = Math.floor(referralValidated / 5);
  const totalTokens = socialValidated + referralTokens;
  const tokensToNext = Math.max(0, TOKENS_PER_PORTION - totalTokens);

  const now = Date.now();
  const firstOpenIndex = eligible.findIndex(
    (r) => !claimMap[r.type] && !(postponed[r.type] && now < postponed[r.type])
  );

  async function handleAccomplish(type: MicroRewardType) {
    const link = links[type];
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    setBusyType(type);
    await fetch("/api/micro-rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reward_type: type, restaurantId }),
    });
    await fetchData();
    setBusyType(null);
  }

  function handlePostpone(type: MicroRewardType) {
    const next = { ...postponed, [type]: Date.now() + SNOOZE_24H };
    setPostponed(next);
    localStorage.setItem(POSTPONE_PREFIX + restaurantId, JSON.stringify(next));
    fetch("/api/micro-rewards/postpone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reward_type: type, restaurantId }),
    }).catch(() => {});
  }

  return (
    <div>
      {hasEligible && (
        <>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
              Prochaine étape
            </p>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">
              🎁 {giftName}
            </span>
          </div>
          <p className="text-xl font-black text-gray-900 mb-2">
            {Math.min(totalTokens, TOKENS_PER_PORTION)}/{TOKENS_PER_PORTION} jetons
          </p>
          <div className="flex gap-1.5 mb-6">
            {Array.from({ length: TOKENS_PER_PORTION }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full ${i < totalTokens ? "bg-orange-500" : "bg-gray-100"}`}
              />
            ))}
          </div>
        </>
      )}

      {showRungs && (
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ton échelle</p>
      )}

      <div className="space-y-4">
        {showRungs &&
          eligible.map((reward, i) => {
            const claim = claimMap[reward.type];
            const isDone = !!claim;
            const isCurrent = i === firstOpenIndex;
            const isLastRung = i === eligible.length - 1 && !nextCommunityItem;
            const handle = getSocialHandle(reward.type, links[reward.type]);

            return (
              <div key={reward.type} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isDone
                        ? "bg-green-500 text-white"
                        : isCurrent
                          ? "border-2 border-orange-500 text-orange-600"
                          : "border-2 border-gray-200 text-gray-300"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  {!isLastRung && <span className="w-px flex-1 bg-gray-100 mt-1" aria-hidden="true" />}
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <p className={`font-bold text-sm ${isDone || isCurrent ? "text-gray-900" : "text-gray-400"}`}>
                    {reward.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Jeton {i + 1} ·{" "}
                    {isDone
                      ? claim.status === "validated"
                        ? "validé"
                        : "en validation, sous 24h"
                      : isCurrent
                        ? (handle ?? "l'action du moment")
                        : "à venir"}
                  </p>
                  {isCurrent && !isDone && (
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => handleAccomplish(reward.type)}
                        disabled={busyType === reward.type}
                        className="bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                      >
                        {busyType === reward.type ? "…" : ACTION_BUTTON_LABELS[reward.type]}
                      </button>
                      <button
                        onClick={() => handlePostpone(reward.type)}
                        disabled={busyType === reward.type}
                        className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Plus tard
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {/* Actions sociales épuisées — on ne fait plus jamais reproposer une
            action déjà validée, mais on indique où en est le cadeau plutôt
            que de faire disparaître la carte sans explication. */}
        {allSocialDone && (
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold shrink-0"
                aria-hidden="true"
              >
                ✓
              </span>
              {nextCommunityItem && <span className="w-px flex-1 bg-gray-100 mt-1" aria-hidden="true" />}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <p className="font-bold text-sm text-gray-900">Actions sociales terminées</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalTokens >= TOKENS_PER_PORTION
                  ? `🎉 ${giftName} débloqué — présente-toi au comptoir pour le récupérer.`
                  : `Encore ${tokensToNext} jeton${tokensToNext > 1 ? "s" : ""} via le parrainage pour débloquer ${giftName}.`}
              </p>
            </div>
          </div>
        )}

        {nextCommunityItem && (
          <div className="flex gap-3">
            <span
              className="w-6 h-6 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-300 shrink-0"
              aria-hidden="true"
            >
              +
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-gray-900">Bonus d&apos;équipe</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {nextCommunityScore !== null &&
                  `${nextCommunityScore.toLocaleString("fr-BE")} pts collectifs · `}
                + {nextCommunityItem} sur chaque commande
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
