"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { ACTION_ICONS, ACTION_BUTTON_LABELS, ACTION_ORDER, getActionLinks } from "@/lib/social-actions";
import type { MicroReward, MicroRewardClaim } from "@/types";

// « Je le ferai plus tard » : snooze local (par device), même convention que
// OnboardingFlow — pas de colonne serveur, ça reviendra dans 24h.
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

export function ActionCardsSection() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const restaurant = useRestaurantInfo();
  const [rewards, setRewards] = useState<MicroReward[] | null>(null);
  const [claims, setClaims] = useState<MicroRewardClaim[]>([]);
  const [postponed, setPostponed] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

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
  const claimedTypes = new Set(claims.map((c) => c.reward_type));

  const eligible = rewards
    .filter((r) => links[r.type])
    .sort((a, b) => ACTION_ORDER.indexOf(a.type) - ACTION_ORDER.indexOf(b.type));

  const now = Date.now();
  const queue = eligible.filter(
    (r) => !claimedTypes.has(r.type) && !(postponed[r.type] && now < postponed[r.type])
  );

  if (queue.length === 0 || eligible.length === 0) return null;

  const current = queue[0];
  const stepNumber = eligible.length - queue.length + 1;

  async function handleAccomplish() {
    const link = links[current.type];
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    setBusy(true);
    await fetch("/api/micro-rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reward_type: current.type, restaurantId }),
    });
    await fetchData();
    setBusy(false);
  }

  function handlePostpone() {
    const next = { ...postponed, [current.type]: Date.now() + SNOOZE_24H };
    setPostponed(next);
    localStorage.setItem(POSTPONE_PREFIX + restaurantId, JSON.stringify(next));
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Action à faire
        </h2>
        {eligible.length > 1 && (
          <span className="text-xs font-medium text-gray-400">
            {stepNumber}/{eligible.length}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl shrink-0" aria-hidden="true">{ACTION_ICONS[current.type]}</span>
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 text-sm">{current.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{current.description}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleAccomplish}
          disabled={busy}
          className="flex-1 bg-green-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {busy ? "…" : ACTION_BUTTON_LABELS[current.type]}
        </button>
        <button
          onClick={handlePostpone}
          disabled={busy}
          className="flex-1 bg-amber-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          Je le ferai plus tard
        </button>
      </div>
    </div>
  );
}
