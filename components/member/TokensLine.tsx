"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Gift } from "lucide-react";
import { useParams } from "next/navigation";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";
import { ACTION_ORDER, TOKENS_PER_PORTION, getActionLinks } from "@/lib/social-actions";
import type { MicroReward, MicroRewardClaim } from "@/types";

// ADR 0059 — les jetons sur l'accueil, en UNE ligne : où j'en suis et la
// prochaine action, le détail vit dans l'onglet Actions. Même compte que
// l'onglet et que l'ancienne échelle (actions sociales validées + 1 jeton par
// 5 parrainages) — sinon le « X/4 » différerait d'un écran à l'autre.
export function TokensLine() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const restaurant = useRestaurantInfo();
  const [rewards, setRewards] = useState<MicroReward[] | null>(null);
  const [claims, setClaims] = useState<MicroRewardClaim[]>([]);
  const [giftName, setGiftName] = useState("Cadeau surprise");
  const [referralValidated, setReferralValidated] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [socialRes, refRes] = await Promise.all([
          fetch(`/api/micro-rewards?restaurantId=${restaurantId}`),
          fetch(`/api/referrals?restaurantId=${restaurantId}`),
        ]);
        if (cancelled) return;
        if (socialRes.ok) {
          const data = await socialRes.json();
          setRewards(data.rewards ?? []);
          setClaims(data.claims ?? []);
          if (data.giftName) setGiftName(data.giftName);
        } else {
          setRewards([]);
        }
        if (refRes.ok) {
          const data = await refRes.json();
          setReferralValidated(data.validatedCount ?? 0);
        }
      } catch {
        if (!cancelled) setRewards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  if (rewards === null) return null;

  const links = getActionLinks(restaurant, restaurantId);
  const claimMap = Object.fromEntries(claims.map((c) => [c.reward_type, c]));
  const eligible = rewards
    .filter((r) => links[r.type])
    .sort((a, b) => ACTION_ORDER.indexOf(a.type) - ACTION_ORDER.indexOf(b.type));
  if (eligible.length === 0) return null;

  const socialValidated = eligible.filter((r) => claimMap[r.type]?.status === "validated").length;
  const totalTokens = Math.min(TOKENS_PER_PORTION, socialValidated + Math.floor(referralValidated / 5));
  const nextAction = eligible.find((r) => !claimMap[r.type]);
  const hint =
    totalTokens >= TOKENS_PER_PORTION
      ? "Débloqué — à récupérer au comptoir"
      : nextAction
        ? nextAction.title
        : "Parraine tes amis pour le dernier jeton";

  return (
    <Link
      href={`/r/${restaurantId}/micro-rewards`}
      className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:bg-gray-50 transition-colors"
    >
      <Gift className="w-6 h-6 shrink-0 text-orange-600" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">
          Un cadeau en plus · {giftName}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: TOKENS_PER_PORTION }).map((_, i) => (
              <span
                key={i}
                className={`w-4 h-1.5 rounded-full ${i < totalTokens ? "bg-orange-500" : "bg-gray-200"}`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 tabular-nums shrink-0">
            {totalTokens}/{TOKENS_PER_PORTION} jetons
          </span>
          <span className="text-xs text-gray-500 truncate">· {hint}</span>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 shrink-0 text-gray-400" aria-hidden="true" />
    </Link>
  );
}
