"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { CommunityScore, Team } from "@/types";

// total_spent (euros) ne doit jamais entrer dans ce composant — ADR 0007
type LeaderboardRow = Omit<CommunityScore, "total_spent"> & {
  teams: Pick<Team, "name" | "flag_emoji" | "is_active">;
};

export function LeaderboardRealtime({
  initial,
  myTeamId,
}: {
  initial: LeaderboardRow[];
  myTeamId?: string;
}) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initial);
  const [flash, setFlash] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("leaderboard-scores")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_scores" },
        (payload) => {
          // Ne reprendre que les champs autorisés côté client — le payload
          // realtime contient la ligne complète (dont total_spent)
          const updated = payload.new as CommunityScore;
          setRows((prev) => {
            const idx = prev.findIndex((r) => r.team_id === updated.team_id);
            if (idx === -1) return prev;

            const next = [...prev];
            next[idx] = {
              ...next[idx],
              member_count: updated.member_count,
              score: updated.score,
              last_updated: updated.last_updated,
            };
            next.sort((a, b) => b.score - a.score);
            return next;
          });

          // Flash the updated row briefly
          setFlash((prev) => new Set(Array.from(prev).concat(updated.team_id)));
          setTimeout(() => {
            setFlash((prev) => {
              const next = new Set(prev);
              next.delete(updated.team_id);
              return next;
            });
          }, 1500);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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

            {/* Nom + stade */}
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
                {Number(entry.score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
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
