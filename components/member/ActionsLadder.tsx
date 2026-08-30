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
  const [postponed, setPostponed] = useState<Record<string, number>>({});
  const [busyType, setBusyType] = useState<MicroRewardType | null>(null);

  useEffect(() => {
    setPostponed(loadPostponed(restaurantId));
    fetchData();
  }, []);

  async function fetchData() {
    const res = await fetch(`/api/micro-rewards?restaurantId=${restaurantId}`);
    if (res.ok) {
      const data = await res.json();
      setRewards(data.rewards ?? []);
      setClaims(data.claims ?? []);
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

  const allValidated =
    eligible.length > 0 && eligible.every((r) => claimMap[r.type]?.status === "validated");
  const showLadder = eligible.length > 0 && !allValidated;

  if (!showLadder && !nextCommunityItem) return null;

  const now = Date.now();
  const claimedCount = eligible.filter((r) => claimMap[r.type]).length;
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
      {showLadder && (
        <>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Prochaine étape</p>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Portion offerte</span>
          </div>
          <p className="text-xl font-black text-gray-900 mb-2">
            {claimedCount}/{TOKENS_PER_PORTION} jetons
          </p>
          <div className="flex gap-1.5 mb-6">
            {Array.from({ length: TOKENS_PER_PORTION }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full ${i < claimedCount ? "bg-orange-500" : "bg-gray-100"}`}
              />
            ))}
          </div>
        </>
      )}

      {showLadder && (
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ton échelle</p>
      )}

      <div className="space-y-4">
        {showLadder &&
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
