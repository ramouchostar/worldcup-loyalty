"use client";

import useSWR from "swr";
import type { Reward } from "@/types";

type ScoreData = { score: number };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function RewardProgressBar({
  teamId,
  initialScore,
  nextReward,
  restaurantUnlocked,
}: {
  teamId: string;
  initialScore: number;
  nextReward: Reward | null;
  restaurantUnlocked: boolean;
}) {
  const { data } = useSWR<ScoreData>(`/api/scores/${teamId}`, fetcher, {
    refreshInterval: 30_000,
    fallbackData: { score: initialScore },
  });

  const currentScore = data?.score ?? initialScore;

  if (!nextReward) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-2xl mb-1">🏆</p>
        <p className="font-bold text-green-900">Tous les paliers atteints !</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((currentScore / nextReward.score_threshold) * 100));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Prochain palier</p>
          <p className="font-bold text-gray-900 mt-0.5">{nextReward.title}</p>
          <p className="text-sm text-gray-600">{nextReward.gift_details}</p>
        </div>
        <span className="text-sm font-bold text-brand-red tabular-nums">{pct}%</span>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className="bg-brand-red h-3 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between mt-2">
        <p className="text-xs text-gray-400 tabular-nums">
          {currentScore.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
        </p>
        <p className="text-xs text-gray-400 tabular-nums">
          {nextReward.score_threshold.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
        </p>
      </div>

      {!restaurantUnlocked && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
          🔒 Le restaurant doit atteindre son objectif CA pour débloquer les récompenses.
        </p>
      )}
    </div>
  );
}
