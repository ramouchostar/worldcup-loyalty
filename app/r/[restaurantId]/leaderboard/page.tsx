import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, isRestaurantOwner } from "@/lib/restaurant";
import { LeaderboardRealtime } from "@/components/LeaderboardRealtime";
import Link from "next/link";
import { BackLink } from "@/components/member/BackLink";
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

  // ADR 0015 §6 — un établissement pending/disabled reste invisible à tout
  // le monde sauf son propriétaire, y compris sur le classement public
  // (trouvé au test d'envergure : la landing masquait, pas le leaderboard).
  if (!restaurant) notFound();
  if (restaurant.status !== "active") {
    const owner = user ? await isRestaurantOwner(user.id, restaurantId) : false;
    if (!owner) notFound();
  }

  const scores = ((scoresRaw as unknown as LeaderboardRow[]) ?? []).filter(s => s.teams?.is_active);
  const myTeamId = (membershipResult.data as { team_id: string | null } | null)?.team_id ?? undefined;

  // ADR 0030 §5 — parent logique : l'onglet Équipe pour un membre de cet
  // établissement, la landing publique pour un visiteur (page publique sans
  // BottomNav — c'était un cul-de-sac total en anonyme).
  const backHref = user && membershipResult.data ? `/r/${restaurantId}/my-team` : `/r/${restaurantId}`;

  const totalMembers = scores.reduce((sum, s) => sum + s.member_count, 0);
  const activeTeams = scores.filter((s) => s.teams.is_active).length;
  const topScore = scores[0]?.score ?? 0;

  return (
    <div className="space-y-5 pb-4">
      {/* Lien retour unifié (BackLink) — hors du hero sombre pour le contraste */}
      <BackLink href={backHref} label={user && membershipResult.data ? "Mon équipe" : "Retour"} />

      {/* Hero */}
      <div className="bg-brand-dark text-white rounded-2xl px-4 py-6 -mx-4 sm:mx-0 sm:rounded-2xl">
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
              {Number(topScore).toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
            </p>
            <p className="text-xs text-gray-400">équipe en tête</p>
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

        <LeaderboardRealtime initial={scores} myTeamId={myTeamId} restaurantId={restaurantId} />
      </div>

      {/* CTA si non connecté */}
      {!user && (
        <div className="bg-brand-red rounded-2xl p-5 text-center text-white">
          <p className="font-bold text-lg mb-1">Rejoins ta communauté</p>
          <p className="text-red-50 text-sm mb-4">
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
