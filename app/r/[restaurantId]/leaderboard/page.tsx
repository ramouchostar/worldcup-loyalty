import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant } from "@/lib/restaurant";
import { LeaderboardRealtime } from "@/components/LeaderboardRealtime";
import Link from "next/link";
import type { CommunityScore, Team } from "@/types";

// total_spent (euros) jamais sélectionné côté client — ADR 0007
type LeaderboardRow = Omit<CommunityScore, "total_spent"> & {
  teams: Pick<Team, "name" | "flag_emoji" | "is_active">;
};

export const revalidate = 60;

export default async function LeaderboardPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();

  // Récupère l'utilisateur connecté pour highlight sa communauté (optionnel)
  const { data: { user } } = await supabase.auth.getUser();

  const [restaurant, { data: scoresRaw }, membershipResult] = await Promise.all([
    getRestaurant(restaurantId),
    supabase
      .from("community_scores")
      .select(`
        team_id,
        member_count,
        score,
        last_updated,
        teams!inner (
          name,
          flag_emoji,
          is_active
        )
      `)
      .eq("teams.restaurant_id", restaurantId)
      .order("score", { ascending: false }),
    user
      ? supabase.from("memberships").select("team_id").eq("user_id", user.id).eq("restaurant_id", restaurantId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const scores = ((scoresRaw as unknown as LeaderboardRow[]) ?? []).filter(s => s.teams?.is_active);
  const myTeamId = (membershipResult.data as { team_id: string | null } | null)?.team_id ?? undefined;

  const totalMembers = scores.reduce((sum, s) => sum + s.member_count, 0);
  const activeTeams = scores.filter((s) => s.teams.is_active).length;
  const topScore = scores[0]?.score ?? 0;

  return (
    <div className="space-y-5 pb-4">
      {/* Hero */}
      <div className="bg-brand-dark text-white rounded-2xl px-4 py-6 -mx-4 -mt-6 sm:mx-0 sm:mt-0 sm:rounded-2xl">
        <h1 className="text-2xl font-black">🏆 Classement des équipes</h1>
        <p className="text-gray-400 text-sm mt-1">
          Quelle équipe mange le plus chez {restaurant?.name ?? "nous"} ?
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

      {/* Légende score */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-2 text-xs text-gray-500">
        <span>📡</span>
        <span>
          Classement mis à jour en <strong>temps réel</strong> — le score reflète la fidélité et la taille de chaque communauté
        </span>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Toutes les communautés</h2>
          <span className="text-xs text-gray-400">{scores.length} équipes</span>
        </div>

        <LeaderboardRealtime initial={scores} myTeamId={myTeamId} />
      </div>

      {/* CTA si non connecté */}
      {!user && (
        <div className="bg-brand-red rounded-2xl p-5 text-center text-white">
          <p className="font-bold text-lg mb-1">Rejoins ta communauté</p>
          <p className="text-red-100 text-sm mb-4">
            Chaque commande chez {restaurant?.name ?? "nous"} fait monter le score de ton équipe.
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
  );
}
