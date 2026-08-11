"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { CommunityScore, Team } from "@/types";

// total_spent (euros) n'entre JAMAIS dans ce composant — ADR 0007. Les mises à
// jour se font par POLLING d'un endpoint euro-free (plus d'abonnement Realtime,
// qui transportait la ligne complète — dont total_spent — sur le WebSocket).
type LeaderboardRow = Omit<CommunityScore, "total_spent"> & {
  teams: Pick<Team, "name" | "flag_emoji" | "is_active">;
};

const fetcher = (url: string): Promise<LeaderboardRow[]> => fetch(url).then((r) => r.json());

export function LeaderboardRealtime({
  initial,
  myTeamId,
  restaurantId,
}: {
  initial: LeaderboardRow[];
  myTeamId?: string;
  restaurantId: string;
}) {
  const { data } = useSWR<LeaderboardRow[]>(`/api/leaderboard/${restaurantId}`, fetcher, {
    fallbackData: initial,
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  const rows = [...(data ?? initial)].sort((a, b) => b.score - a.score);

  // Flash bref des lignes dont le score a bougé depuis le dernier snapshot.
  const prevScores = useRef<Map<string, number>>(new Map(initial.map((r) => [r.team_id, r.score])));
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const changed = new Set<string>();
    for (const r of rows) {
      const prev = prevScores.current.get(r.team_id);
      if (prev !== undefined && prev !== r.score) changed.add(r.team_id);
      prevScores.current.set(r.team_id, r.score);
    }
    if (changed.size === 0) return;
    setFlash(changed);
    const t = setTimeout(() => setFlash(new Set()), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // État vide instructif (audit UX 2026-08-11) — jamais un tableau muet.
  if (rows.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-4xl mb-3" aria-hidden="true">🏆</p>
        <p className="font-bold text-gray-900 mb-1">Aucune équipe pour l&apos;instant.</p>
        <p className="text-sm text-gray-500 mb-4">
          Crée la première et prends la tête du classement !
        </p>
        <Link
          href={`/r/${restaurantId}/my-team`}
          className="inline-flex items-center bg-brand-red text-white text-sm font-semibold px-5 py-3 min-h-[48px] rounded-xl hover:bg-brand-red/85 transition-colors"
        >
          Créer mon équipe →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((entry, idx) => {
        const isMyTeam = entry.team_id === myTeamId;
        const isFlashing = flash.has(entry.team_id);

        return (
          <div
            key={entry.team_id}
            className={`flex items-center gap-3 p-3 rounded-xl transition-colors duration-700 ${
              isFlashing
                ? "bg-yellow-50 border border-yellow-300"
                : isMyTeam
                ? "bg-red-50 border border-brand-red"
                : entry.teams.is_active
                ? "bg-white border border-gray-100"
                : "bg-gray-50 border border-gray-100 opacity-50"
            }`}
          >
            {/* Rang */}
            <span className={`w-8 text-center font-bold text-sm shrink-0 ${
              idx === 0 ? "text-yellow-500 text-lg" :
              idx === 1 ? "text-gray-400 text-base" :
              idx === 2 ? "text-amber-600 text-base" :
              "text-gray-400"
            }`}>
              {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
            </span>

            {/* Drapeau */}
            <span className="text-2xl">{entry.teams.flag_emoji}</span>

            {/* Nom */}
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm truncate ${isMyTeam ? "text-brand-red" : "text-gray-900"}`}>
                {entry.teams.name}
                {isMyTeam && <span className="ml-1 text-xs font-normal text-brand-red">← toi</span>}
              </p>
              {!entry.teams.is_active && (
                <p className="text-xs text-gray-400">inactive</p>
              )}
            </div>

            {/* Stats */}
            <div className="text-right shrink-0">
              <p className="font-bold text-gray-900 tabular-nums text-sm">
                {Number(entry.score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
                {isFlashing && <span className="ml-1 text-yellow-500 text-xs">▲</span>}
              </p>
              <p className="text-xs text-gray-400 tabular-nums">
                {entry.member_count} membres
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
