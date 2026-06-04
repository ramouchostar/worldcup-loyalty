import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { ScoreCard } from "@/components/member/ScoreCard";
import type { CommunityScore } from "@/types";

type LeaderboardEntry = CommunityScore & {
  teams: { name: string; flag_emoji: string; is_active: boolean; round_reached: string };
};

export default async function MyTeamPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("team_id, teams(name, flag_emoji, is_active, round_reached)")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as {
    team_id: string;
    teams: { name: string; flag_emoji: string; is_active: boolean; round_reached: string };
  } | null;

  if (!profile?.team_id) redirect("/register");

  const [{ data: scoreRaw }, { data: allScores }] = await Promise.all([
    supabase
      .from("community_scores")
      .select("team_id, member_count, total_spent, score, last_updated")
      .eq("team_id", profile.team_id)
      .single(),
    supabase
      .from("community_scores")
      .select("team_id, score, teams(name, flag_emoji, is_active, round_reached)")
      .order("score", { ascending: false }),
  ]);

  const score = scoreRaw as CommunityScore | null;
  const leaderboard = (allScores as unknown as LeaderboardEntry[]) ?? [];
  const rank = leaderboard.findIndex((s) => s.team_id === profile.team_id) + 1;
  const team = profile.teams;

  const roundLabels: Record<string, string> = {
    group_stage: "Phase de groupes",
    round_of_16: "Huitièmes de finale",
    quarter_final: "Quarts de finale",
    semi_final: "Demi-finales",
    final: "Finale",
    winner: "Champion 🏆",
  };

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ma communauté</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ta contribution aide toute ta communauté à débloquer des récompenses.
        </p>
      </div>

      {/* Carte équipe */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-5xl">{team.flag_emoji}</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{team.name}</h2>
              <p className="text-sm text-gray-500">{roundLabels[team.round_reached] ?? team.round_reached}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-brand-red">#{rank}</p>
            <p className="text-xs text-gray-400">au classement</p>
          </div>
        </div>

        {!team.is_active && (
          <div className="mt-4 bg-red-50 rounded-lg p-3 flex items-center gap-2">
            <span>🔴</span>
            <p className="text-red-800 text-sm font-medium">
              Équipe éliminée —{" "}
              <Link href="/transfer" className="underline">
                transférer vers une équipe active
              </Link>
            </p>
          </div>
        )}

        <ScoreCard
          teamId={profile.team_id}
          initial={{
            team_id: profile.team_id,
            member_count: score?.member_count ?? 0,
            score: score?.score ?? 0,
          }}
        />
      </div>

      {/* Formule du score */}
      <div className="bg-brand-dark rounded-xl p-4 text-white">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Comment le score est calculé</p>
        <div className="flex items-center gap-2 text-sm font-mono">
          <span className="bg-white/10 rounded px-2 py-1">Membres</span>
          <span className="text-brand-gold font-bold text-lg">×</span>
          <span className="bg-white/10 rounded px-2 py-1">CA total (€)</span>
          <span className="text-brand-gold font-bold text-lg">=</span>
          <span className="bg-brand-gold text-brand-dark rounded px-2 py-1 font-bold">Score</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Bonus ×1.5 pendant 48h après chaque qualification de ton équipe.
        </p>
      </div>

      {/* Top 10 classement */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 mb-4">Classement général</h3>
        <div className="space-y-2">
          {leaderboard.slice(0, 10).map((entry, idx) => {
            const isMyTeam = entry.team_id === profile.team_id;
            const entryTeam = entry.teams as { name: string; flag_emoji: string; is_active: boolean };
            return (
              <div
                key={entry.team_id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  isMyTeam ? "bg-red-50 border border-brand-red" : "bg-gray-50"
                } ${!entryTeam.is_active ? "opacity-50" : ""}`}
              >
                <span className={`w-7 text-center font-bold text-sm ${
                  idx === 0 ? "text-yellow-500" :
                  idx === 1 ? "text-gray-400" :
                  idx === 2 ? "text-amber-600" : "text-gray-400"
                }`}>
                  {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                </span>
                <span className="text-xl">{entryTeam.flag_emoji}</span>
                <span className={`flex-1 text-sm font-medium ${isMyTeam ? "text-brand-red" : "text-gray-800"}`}>
                  {entryTeam.name} {isMyTeam && "← toi"}
                </span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                  {Number(entry.score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })}
        </div>
        <Link href="/leaderboard" className="block text-center text-brand-red text-sm font-semibold mt-4 hover:underline">
          Voir le classement complet →
        </Link>
      </div>
    </div>
  );
}
