import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant } from "@/lib/restaurant";
import { joinRestaurant } from "@/app/join/actions";
import { redirectToLogin } from "./actions";
import type { CommunityScore, Team } from "@/types";

type LeaderboardRow = Omit<CommunityScore, "total_spent"> & {
  teams: Pick<Team, "name" | "flag_emoji" | "is_active">;
};

const STEPS = [
  {
    num: "1",
    icon: "👥",
    title: "Rejoins ou crée ton équipe",
    desc: "École, entreprise, quartier, taxis... crée ton équipe ou rejoins celle de tes proches.",
  },
  {
    num: "2",
    icon: "🧾",
    title: "Commande directement",
    desc: "Chaque commande passée en salle ou par téléphone fait progresser toute ton équipe.",
  },
  {
    num: "3",
    icon: "🎁",
    title: "Gagnez ensemble",
    desc: "Plus votre équipe commande, plus vous débloquez de cadeaux collectifs.",
  },
];

export default async function RestaurantLandingPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: membership }, { data: scoresRaw }] = await Promise.all([
    user
      ? supabase.from("memberships").select("user_id").eq("user_id", user.id).eq("restaurant_id", restaurantId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("community_scores")
      .select(`
        team_id, member_count, score, last_updated,
        teams!inner ( name, flag_emoji, is_active )
      `)
      .eq("teams.restaurant_id", restaurantId)
      .order("score", { ascending: false })
      .limit(5),
  ]);

  const top5 = ((scoresRaw as unknown as LeaderboardRow[]) ?? []).filter((s) => s.teams?.is_active);
  const totalMembers = top5.reduce((sum, s) => sum + s.member_count, 0);
  const isMember = !!membership;

  return (
    <div className="min-h-screen bg-white">
      {/* ── HERO ── */}
      <div className="bg-brand-dark text-white">
        <div className="max-w-lg mx-auto px-5 pt-12 pb-10">
          <div className="inline-flex items-center gap-2 bg-brand-red/20 border border-brand-red/40 rounded-full px-3 py-1 mb-5">
            <span className="text-brand-gold text-xs font-bold uppercase tracking-widest">{restaurant.name}</span>
          </div>

          <h1 className="text-4xl font-black leading-tight mb-3">
            Fidélise-toi,<br />
            <span className="text-brand-gold">gagne des cadeaux.</span>
          </h1>

          <p className="text-gray-300 text-base leading-relaxed mb-8">
            Le programme de fidélité communautaire de{" "}
            <span className="text-white font-bold">{restaurant.name}</span>.
            Plus ton équipe commande, plus vous gagnez ensemble.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            {!user ? (
              <form action={redirectToLogin.bind(null, restaurantId)} className="flex-1">
                <button
                  type="submit"
                  className="w-full bg-brand-red text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-red-700 transition-colors shadow-lg"
                >
                  Rejoindre gratuitement →
                </button>
              </form>
            ) : isMember ? (
              <Link
                href={`/r/${restaurantId}/dashboard`}
                className="flex-1 bg-brand-red text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-red-700 transition-colors shadow-lg"
              >
                Continuer →
              </Link>
            ) : (
              <form action={joinRestaurant.bind(null, restaurantId)} className="flex-1">
                <button
                  type="submit"
                  className="w-full bg-brand-red text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-red-700 transition-colors shadow-lg"
                >
                  Rejoindre {restaurant.name} →
                </button>
              </form>
            )}
            <Link
              href={`/r/${restaurantId}/leaderboard`}
              className="flex-1 bg-white/10 text-white text-center py-4 rounded-2xl font-semibold hover:bg-white/20 transition-colors border border-white/20"
            >
              🏆 Classement live
            </Link>
          </div>

          {totalMembers > 0 && (
            <p className="text-center text-gray-400 text-sm mt-6">
              <span className="text-white font-bold">{totalMembers}</span> membres inscrits chez {restaurant.name}
            </p>
          )}
        </div>
      </div>

      {/* ── COMMENT ÇA MARCHE ── */}
      <div className="max-w-lg mx-auto px-5 py-10">
        <h2 className="text-2xl font-black text-gray-900 mb-2">Comment ça marche ?</h2>
        <p className="text-gray-500 text-sm mb-6">3 étapes, c&apos;est tout.</p>

        <div className="space-y-4">
          {STEPS.map((step) => (
            <div key={step.num} className="flex gap-4 bg-gray-50 rounded-2xl p-5">
              <div className="w-10 h-10 bg-brand-dark text-brand-gold rounded-xl flex items-center justify-center font-black text-lg shrink-0">
                {step.num}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{step.icon}</span>
                  <h3 className="font-bold text-gray-900">{step.title}</h3>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TOP 5 ÉQUIPES ── */}
      {top5.length > 0 && (
        <div className="bg-gray-50 py-10">
          <div className="max-w-lg mx-auto px-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-2xl font-black text-gray-900">Top 5 équipes</h2>
                <p className="text-gray-500 text-sm">Chez {restaurant.name}</p>
              </div>
              <Link href={`/r/${restaurantId}/leaderboard`} className="text-brand-red text-sm font-semibold hover:underline">
                Voir tout →
              </Link>
            </div>

            <div className="space-y-2">
              {top5.map((entry, idx) => (
                <div
                  key={entry.team_id}
                  className={`flex items-center gap-3 p-4 rounded-xl bg-white ${
                    idx === 0 ? "border border-brand-gold/30" : "border border-gray-100"
                  }`}
                >
                  <span className={`w-7 text-center font-black shrink-0 ${
                    idx === 0 ? "text-yellow-500 text-lg" :
                    idx === 1 ? "text-gray-400" :
                    idx === 2 ? "text-amber-600" : "text-gray-400 text-sm"
                  }`}>
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                  </span>
                  <span className="text-2xl">{entry.teams.flag_emoji}</span>
                  <span className="flex-1 font-semibold text-sm text-gray-800">{entry.teams.name}</span>
                  <div className="text-right">
                    <p className="font-black text-gray-900 tabular-nums text-sm">
                      {Number(entry.score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-gray-400">{entry.member_count} membres</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CTA FINAL ── */}
      <div className="bg-brand-red text-white py-12">
        <div className="max-w-lg mx-auto px-5 text-center">
          <p className="text-4xl mb-4">🎁</p>
          <h2 className="text-3xl font-black mb-3">Prêt à rejoindre {restaurant.name} ?</h2>
          <p className="text-red-100 mb-8 leading-relaxed">
            Inscription gratuite en 30 secondes. Aucune application à télécharger.
          </p>
          {!user ? (
            <form action={redirectToLogin.bind(null, restaurantId)}>
              <button
                type="submit"
                className="inline-block bg-white text-brand-red font-black text-lg px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
              >
                Je rejoins ma communauté →
              </button>
            </form>
          ) : isMember ? (
            <Link
              href={`/r/${restaurantId}/dashboard`}
              className="inline-block bg-white text-brand-red font-black text-lg px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
            >
              Continuer →
            </Link>
          ) : (
            <form action={joinRestaurant.bind(null, restaurantId)}>
              <button
                type="submit"
                className="inline-block bg-white text-brand-red font-black text-lg px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
              >
                Je rejoins ma communauté →
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="bg-brand-dark text-gray-500 py-6">
        <div className="max-w-lg mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="font-bold text-gray-400">{restaurant.name}</span>
          <div className="flex gap-4">
            <Link href={`/r/${restaurantId}/leaderboard`} className="hover:text-gray-300 transition-colors">Classement</Link>
            <Link href="/login" className="hover:text-gray-300 transition-colors">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
