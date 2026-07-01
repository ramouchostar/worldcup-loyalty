import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { ScoreCard } from "@/components/member/ScoreCard";
import { TeamManager } from "@/components/member/TeamManager";
import type { TeamType } from "@/types";

const TYPE_LABEL: Record<TeamType, string> = {
  ecole: "École",
  entreprise: "Entreprise",
  rue_quartier: "Rue / quartier",
  taxis: "Taxis",
  autre: "Autre",
};

type MembershipRow = {
  team_id: string | null;
  teams: {
    id: string;
    name: string;
    type: TeamType;
    flag_emoji: string;
    restaurant_id: string | null;
    join_code: string | null;
  } | null;
};

type LbRow = { team_id: string; score: number; teams: { name: string; flag_emoji: string } };

export default async function MyTeamPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const pendingJoin = cookieStore.get("pending_join_code")?.value ?? null;

  const { data: membershipRaw } = await supabase
    .from("memberships")
    .select("team_id, teams(id, name, type, flag_emoji, restaurant_id, join_code)")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  const membership = membershipRaw as unknown as MembershipRow | null;
  const team = membership?.teams ?? null;

  // Pas encore d'équipe dans cet établissement → onboarding créer / rejoindre.
  if (!team) {
    return (
      <div className="space-y-5 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon équipe</h1>
          <p className="text-gray-500 text-sm mt-1">
            Crée ton équipe ou rejoins-en une. Plus vous commandez ensemble, plus vous débloquez de cadeaux.
          </p>
        </div>
        <TeamManager team={null} initialJoinCode={pendingJoin} restaurantId={restaurantId} />
      </div>
    );
  }

  const t = team;
  const [{ data: scoreRaw }, { data: lbRaw }] = await Promise.all([
    supabase
      .from("community_scores")
      .select("member_count, score")
      .eq("team_id", t.id)
      .eq("restaurant_id", restaurantId)
      .single(),
    supabase
      .from("community_scores")
      .select("team_id, score, teams!inner(name, flag_emoji, restaurant_id)")
      .eq("teams.restaurant_id", restaurantId)
      .order("score", { ascending: false })
      .limit(10),
  ]);

  const score = scoreRaw as { member_count: number; score: number } | null;
  const leaderboard = (lbRaw as unknown as LbRow[]) ?? [];
  const rank = leaderboard.findIndex((s) => s.team_id === t.id) + 1;

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon équipe</h1>
        <p className="text-gray-500 text-sm mt-1">Ta contribution fait progresser toute ton équipe.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-5xl">{t.flag_emoji}</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t.name}</h2>
              <p className="text-sm text-gray-500">{TYPE_LABEL[t.type] ?? "Équipe"}</p>
            </div>
          </div>
          {rank > 0 && (
            <div className="text-right">
              <p className="text-3xl font-black text-brand-red">#{rank}</p>
              <p className="text-xs text-gray-400">au classement</p>
            </div>
          )}
        </div>

        <ScoreCard
          teamId={t.id}
          initial={{ team_id: t.id, member_count: score?.member_count ?? 0, score: score?.score ?? 0 }}
        />
      </div>

      <TeamManager
        team={{ id: t.id, name: t.name, type: t.type, join_code: t.join_code ?? "" }}
        initialJoinCode={null}
        restaurantId={restaurantId}
      />

      {leaderboard.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 mb-4">Classement des équipes</h3>
          <div className="space-y-2">
            {leaderboard.map((entry, idx) => {
              const isMine = entry.team_id === t.id;
              return (
                <div
                  key={entry.team_id}
                  className={`flex items-center gap-3 p-3 rounded-lg ${isMine ? "bg-red-50 border border-brand-red" : "bg-gray-50"}`}
                >
                  <span className="w-7 text-center font-bold text-sm text-gray-400">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                  </span>
                  <span className="text-xl">{entry.teams.flag_emoji}</span>
                  <span className={`flex-1 text-sm font-medium ${isMine ? "text-brand-red" : "text-gray-800"}`}>
                    {entry.teams.name} {isMine && "← toi"}
                  </span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {Number(entry.score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
