import { createServerSupabaseClient } from "@/lib/supabase";
import { LeaderboardRealtime } from "@/components/LeaderboardRealtime";
import Link from "next/link";
import type { CommunityScore, Team } from "@/types";

type LeaderboardRow = CommunityScore & {
  teams: Pick<Team, "name" | "flag_emoji" | "is_active" | "round_reached">;
};

export const revalidate = 60;

export default async function LeaderboardPage() {
  const supabase = await createServerSupabaseClient();

  // Récupère l'utilisateur connecté pour highlight sa communauté (optionnel)
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: scoresRaw }, profileResult] = await Promise.all([
    supabase
      .from("community_scores")
      .select(`
        team_id,
        member_count,
        total_spent,
        score,
        last_updated,
        teams (
          name,
          flag_emoji,
          is_active,
          round_reached
        )
      `)
      .order("score", { ascending: false }),
    user
      ? supabase.from("profiles").select("team_id").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const scores = (scoresRaw as unknown as LeaderboardRow[]) ?? [];
  const myTeamId = (profileResult.data as { team_id: string } | null)?.team_id ?? undefined;

  const totalMembers = scores.reduce((sum, s) => sum + s.member_count, 0);
  const activeTeams = scores.filter((s) => s.teams.is_active).length;
  const topScore = scores[0]?.score ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-brand-dark text-white px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Belchicken
            </Link>
            {!user && (
              <Link
                href="/login"
                className="text-sm bg-brand-red px-4 py-1.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Rejoindre →
              </Link>
            )}
          </div>
          <h1 className="text-2xl font-black">🏆 Classement WorldCup</h1>
          <p className="text-gray-400 text-sm mt-1">
            Quel supporter mange le plus chez Belchicken ?
          </p>

          {/* Stats globales */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-brand-gold">{totalMembers}</p>
              <p className="text-xs text-gray-400">membres</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-brand-gold">{activeTeams}</p>
              <p className="text-xs text-gray-400">équipes actives</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-brand-gold">
                {Number(topScore).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-gray-400">score leader</p>
            </div>
          </div>
        </div>
      </div>

      {/* Légende score */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-2 text-xs text-gray-500">
          <span>📡</span>
          <span>
            Classement mis à jour en <strong>temps réel</strong> via Supabase Realtime
            — Score = Membres × CA total (€)
          </span>
        </div>
      </div>

      {/* Tableau */}
      <div className="max-w-lg mx-auto px-4 py-4 pb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Toutes les communautés</h2>
            <span className="text-xs text-gray-400">{scores.length} équipes</span>
          </div>

          <LeaderboardRealtime initial={scores} myTeamId={myTeamId} />
        </div>

        {/* CTA si non connecté */}
        {!user && (
          <div className="mt-5 bg-brand-red rounded-2xl p-5 text-center text-white">
            <p className="font-bold text-lg mb-1">Rejoins ta communauté</p>
            <p className="text-red-100 text-sm mb-4">
              Chaque commande chez Belchicken fait monter le score de ton équipe.
            </p>
            <Link
              href="/login"
              className="inline-block bg-white text-brand-red font-bold px-6 py-2.5 rounded-xl hover:bg-red-50 transition-colors"
            >
              Participer gratuitement →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
