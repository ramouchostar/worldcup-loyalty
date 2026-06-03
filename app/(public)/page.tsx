import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { CommunityScore, Team, Reward } from "@/types";

export const revalidate = 60;

type LeaderboardRow = CommunityScore & {
  teams: Pick<Team, "name" | "flag_emoji" | "is_active">;
};

const STEPS = [
  {
    num: "1",
    icon: "🏴",
    title: "Choisis ton équipe",
    desc: "Inscris-toi gratuitement et rejoins la communauté de ton équipe préférée.",
  },
  {
    num: "2",
    icon: "🧾",
    title: "Commande chez Belchicken",
    desc: "Chaque repas acheté en restaurant fait monter le score de toute ta communauté.",
  },
  {
    num: "3",
    icon: "🎁",
    title: "Gagnez ensemble",
    desc: "Quand votre score dépasse un palier, toute la communauté débloque une récompense.",
  },
];

const MICRO_ACTIONS = [
  { icon: "⭐", label: "Avis Google 5★", gift: "Churros (6 pcs)" },
  { icon: "📱", label: "Abonnement réseaux", gift: "Nuggets (4 pcs)" },
  { icon: "🔁", label: "Partage campagne", gift: "Frites Medium" },
  { icon: "👥", label: "Parrainage", gift: "Sauce XXL" },
];

export default async function LandingPage() {
  const supabase = await createServerSupabaseClient();

  const [{ data: scoresRaw }, { data: rewardsRaw }] = await Promise.all([
    supabase
      .from("community_scores")
      .select("team_id, score, member_count, total_spent, last_updated, teams(name, flag_emoji, is_active)")
      .order("score", { ascending: false })
      .limit(5),
    supabase
      .from("rewards")
      .select("id, level, score_threshold, title, gift_details")
      .eq("is_active", true)
      .order("level"),
  ]);

  const top5 = (scoresRaw as unknown as LeaderboardRow[]) ?? [];
  const rewards = (rewardsRaw as Pick<Reward, "id" | "level" | "score_threshold" | "title" | "gift_details">[] ?? []);

  const totalMembers = top5.reduce((sum, s) => sum + s.member_count, 0);

  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO ── */}
      <div className="bg-brand-dark text-white relative overflow-hidden">
        {/* Motif de fond subtil */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-4 left-8 text-8xl">⚽</div>
          <div className="absolute top-12 right-6 text-6xl">🏆</div>
          <div className="absolute bottom-8 left-4 text-5xl">🇧🇪</div>
          <div className="absolute bottom-4 right-12 text-7xl">⚽</div>
        </div>

        <div className="relative max-w-lg mx-auto px-5 pt-12 pb-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-brand-red/20 border border-brand-red/40 rounded-full px-3 py-1 mb-5">
            <span className="text-brand-gold text-xs font-bold uppercase tracking-widest">WorldCup 2026</span>
          </div>

          <h1 className="text-4xl font-black leading-tight mb-3">
            Supporte ton équipe,<br />
            <span className="text-brand-gold">gagne des repas.</span>
          </h1>

          <p className="text-gray-300 text-base leading-relaxed mb-8">
            Le programme de fidélité communautaire de{" "}
            <span className="text-white font-bold">Belchicken</span>.
            Plus ta communauté commande, plus vous gagnez ensemble.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="flex-1 bg-brand-red text-white text-center py-4 rounded-2xl font-bold text-lg hover:bg-red-700 transition-colors shadow-lg"
            >
              Rejoindre gratuitement →
            </Link>
            <Link
              href="/leaderboard"
              className="flex-1 bg-white/10 text-white text-center py-4 rounded-2xl font-semibold hover:bg-white/20 transition-colors border border-white/20"
            >
              🏆 Classement live
            </Link>
          </div>

          {/* Stats rapides */}
          {totalMembers > 0 && (
            <p className="text-center text-gray-400 text-sm mt-6">
              <span className="text-white font-bold">{totalMembers}</span> membres inscrits
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

      {/* ── PALIERS DE RÉCOMPENSES ── */}
      <div className="bg-brand-dark text-white py-10">
        <div className="max-w-lg mx-auto px-5">
          <h2 className="text-2xl font-black mb-1">Ce que vous pouvez gagner</h2>
          <p className="text-gray-400 text-sm mb-6">
            4 paliers de récompenses — débloqués quand le score de votre communauté dépasse le seuil.
          </p>

          <div className="space-y-3">
            {rewards.map((r) => (
              <div key={r.id} className="flex items-center gap-4 bg-white/10 rounded-xl p-4 border border-white/10">
                <div className="w-10 h-10 bg-brand-gold/20 border border-brand-gold/40 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-brand-gold font-black text-sm">P{r.level}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">{r.title}</p>
                  {r.gift_details && (
                    <p className="text-brand-gold text-xs mt-0.5">🎁 {r.gift_details}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">Seuil</p>
                  <p className="font-black text-white tabular-nums text-sm">
                    {Number(r.score_threshold).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 mt-4 text-center">
            Score = Membres × CA total (€) · Bonus ×1.5 après chaque qualification
          </p>
        </div>
      </div>

      {/* ── TOP 5 LEADERBOARD ── */}
      {top5.length > 0 && (
        <div className="max-w-lg mx-auto px-5 py-10">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Top 5 communautés</h2>
              <p className="text-gray-500 text-sm">Mis à jour toutes les minutes</p>
            </div>
            <Link href="/leaderboard" className="text-brand-red text-sm font-semibold hover:underline">
              Voir tout →
            </Link>
          </div>

          <div className="space-y-2">
            {top5.map((entry, idx) => (
              <div
                key={entry.team_id}
                className={`flex items-center gap-3 p-4 rounded-xl ${
                  idx === 0 ? "bg-brand-gold/10 border border-brand-gold/30" : "bg-gray-50 border border-gray-100"
                } ${!entry.teams.is_active ? "opacity-50" : ""}`}
              >
                <span className={`w-7 text-center font-black shrink-0 ${
                  idx === 0 ? "text-yellow-500 text-lg" :
                  idx === 1 ? "text-gray-400" :
                  idx === 2 ? "text-amber-600" : "text-gray-400 text-sm"
                }`}>
                  {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                </span>
                <span className="text-2xl">{entry.teams.flag_emoji}</span>
                <span className={`flex-1 font-semibold text-sm ${idx === 0 ? "text-gray-900" : "text-gray-700"}`}>
                  {entry.teams.name}
                  {!entry.teams.is_active && <span className="ml-1 text-xs text-gray-400">(éliminée)</span>}
                </span>
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
      )}

      {/* ── ACTIONS GRATUITES ── */}
      <div className="bg-gray-50 py-10">
        <div className="max-w-lg mx-auto px-5">
          <h2 className="text-2xl font-black text-gray-900 mb-1">4 cadeaux immédiats</h2>
          <p className="text-gray-500 text-sm mb-6">
            Sans acheter quoi que ce soit — juste pour ton engagement envers Belchicken.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {MICRO_ACTIONS.map((a) => (
              <div key={a.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                <span className="text-3xl">{a.icon}</span>
                <p className="font-semibold text-gray-900 text-sm mt-2">{a.label}</p>
                <p className="text-xs text-brand-red font-medium mt-0.5">🎁 {a.gift}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA FINAL ── */}
      <div className="bg-brand-red text-white py-12">
        <div className="max-w-lg mx-auto px-5 text-center">
          <p className="text-4xl mb-4">🏆</p>
          <h2 className="text-3xl font-black mb-3">Prêt à soutenir ton équipe ?</h2>
          <p className="text-red-100 mb-8 leading-relaxed">
            Inscription gratuite en 30 secondes. Aucune application à télécharger.
          </p>
          <Link
            href="/login"
            className="inline-block bg-white text-brand-red font-black text-lg px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
          >
            Je rejoins ma communauté →
          </Link>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="bg-brand-dark text-gray-500 py-6">
        <div className="max-w-lg mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="font-bold text-gray-400">🏆 WorldCup Loyalty · Belchicken</span>
          <div className="flex gap-4">
            <Link href="/leaderboard" className="hover:text-gray-300 transition-colors">Classement</Link>
            <Link href="/login" className="hover:text-gray-300 transition-colors">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
