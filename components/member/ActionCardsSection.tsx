"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useParams } from "next/navigation";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { ACTION_BUTTON_LABELS, ACTION_ORDER, TOKENS_PER_PORTION, getActionLinks, getSocialHandle } from "@/lib/social-actions";
import { InstagramIcon, TiktokIcon, FacebookIcon, GoogleIcon } from "@/components/member/SocialIcons";
import { TokenProgressRing } from "@/components/member/TokenProgressRing";
import type { MicroReward, MicroRewardClaim, MicroRewardType } from "@/types";

const ACTION_LOGOS: Record<MicroRewardType, ComponentType<{ className?: string }>> = {
  instagram_follow: InstagramIcon,
  tiktok_follow: TiktokIcon,
  facebook_follow: FacebookIcon,
  google_review: GoogleIcon,
};

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

  if (eligible.length === 0) return null;

  const claimedCount = eligible.length - queue.length;

  if (queue.length === 0) {
    const allValidated = eligible.every(
      (r) => claims.find((c) => c.reward_type === r.type)?.status === "validated"
    );
    // Tout est réclamé mais pas encore validé — encore rien à faire, mais on
    // le confirme plutôt que de faire disparaître la carte sans explication.
    if (allValidated) return null;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <TokenProgressRing total={TOKENS_PER_PORTION} completed={claimedCount} size={56} />
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-gray-900 text-base">Toutes les actions sont faites</h3>
            <p className="text-sm text-gray-500 mt-1">
              Tes {claimedCount} jeton{claimedCount > 1 ? "s" : ""} seront validés sous 24h.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const current = queue[0];
  const Logo = ACTION_LOGOS[current.type];
  const handle = getSocialHandle(current.type, links[current.type]);

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
    // Trace serveur (en plus du snooze local) : permet un rappel à 7 jours
    // si la mission n'est toujours pas soumise (ADR 0024).
    fetch("/api/micro-rewards/postpone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reward_type: current.type, restaurantId }),
    }).catch(() => {});
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        {/* Uppercase retiré (FALC, audit UX 2026-08-11) */}
        <h2 className="text-sm font-semibold text-gray-600">
          Action à faire
        </h2>
        <TokenProgressRing total={TOKENS_PER_PORTION} completed={claimedCount} size={40} />
      </div>

      <div className="flex items-center gap-4 mb-6">
        <Logo className="w-16 h-16 shrink-0 rounded-2xl shadow-sm" />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-900 text-base">{current.title}</h3>
          {handle && (
            <p className="text-sm font-semibold text-gray-600 truncate mt-0.5">{handle}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">{current.description}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleAccomplish}
          disabled={busy}
          className="flex-1 bg-green-500 text-white py-3.5 rounded-xl font-semibold text-base hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {busy ? "…" : ACTION_BUTTON_LABELS[current.type]}
        </button>
        <button
          onClick={handlePostpone}
          disabled={busy}
          className="flex-1 bg-amber-500 text-white py-3.5 rounded-xl font-semibold text-base hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          Je le ferai plus tard
        </button>
      </div>
    </div>
  );
}
