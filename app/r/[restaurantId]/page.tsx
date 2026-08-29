import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Scan } from "lucide-react";
import { getLandingTierPreview, type TierPreviewRow } from "@/lib/reward-tier-preview";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, isRestaurantOwner, getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { joinRestaurant } from "@/app/join/actions";
import { redirectToLogin } from "./actions";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { recordLanding } from "@/lib/qr-funnel";
import type { CommunityScore, Team } from "@/types";

type LeaderboardRow = Omit<CommunityScore, "total_spent"> & {
  teams: Pick<Team, "name" | "flag_emoji" | "is_active">;
};

// Cette page est déjà l'atterrissage post-scan : l'étape 1 est la photo, pas
// le scan du QR (redondant, il vient d'être fait pour arriver ici) — ADR 0042.
const STEPS = [
  { num: "1", desc: "Photo du ticket, ici même" },
  { num: "2", desc: "Compte en 10 secondes, une fois la photo prise" },
  { num: "3", desc: "Cadeau au comptoir à ta prochaine visite" },
];

// ADR 0042, amendé par ADR 0043 — jamais d'euro sur cette carte ; le nom
// d'article, lui, est désormais affiché (tiré au hasard dans la bonne
// tranche de prix, cf. lib/reward-tier-preview.ts).
const TIER_COPY: Record<TierPreviewRow["layer"], { icon: string; hint: string }> = {
  solo: { icon: "🍗", hint: "Lors de prochaines commandes" },
  community: { icon: "🤝", hint: "En cumulant avec ta communauté" },
  // "réserve", pas "points" seul — le mot est réservé au score communautaire
  // (glossaire CONTEXT.md, ADR 0021).
  saver: { icon: "🎁", hint: "En cumulant dans ta réserve" },
};

export default async function RestaurantLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ utm_source?: string }>;
}) {
  const { restaurantId } = await params;
  // Cible des QR imprimés : le `utm_source=qr_code` posé sur les liens encodés
  // permet de séparer un scan en salle d'une arrivée par lien partagé.
  const { utm_source: utmSource } = await searchParams;
  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ADR 0015 §6 — un établissement pending/disabled reste invisible à tout
  // le monde sauf son propriétaire (contrôle qualité avant validation).
  if (restaurant.status !== "active") {
    const owner = user ? await isRestaurantOwner(user.id, restaurantId) : false;
    if (!owner) notFound();

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-xl p-8">
          <p className="text-4xl mb-3">🕐</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {restaurant.name} — en attente de validation
          </h1>
          <p className="text-gray-500 text-sm">
            {restaurant.status === "disabled"
              ? "Cet établissement n'est plus actif sur la plateforme."
              : "Notre équipe examine ton établissement. Cette page deviendra visible aux clients dès validation."}
          </p>
        </div>
      </div>
    );
  }

  const [{ data: membership }, { data: scoresRaw }, branding] = await Promise.all([
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
    getRestaurantBranding(restaurantId),
  ]);

  // ADR 0037 — premier étage de l'entonnoir, compté côté serveur : c'est le
  // seul point de mesure qui ne dépende pas du consentement (GA4 refusé par
  // défaut ne voit presque rien). Aucune donnée personnelle, un compteur par
  // jour, et un échec n'empêche jamais la page de s'afficher.
  await recordLanding(
    restaurantId,
    utmSource === "qr_code" ? "qr_code" : "direct",
    user ? "membre" : "anonyme"
  );

  const top5 = ((scoresRaw as unknown as LeaderboardRow[]) ?? []).filter((s) => s.teams?.is_active);
  const isMember = !!membership;
  // ADR 0040 — un membre qui rescanne le QR n'a rien à faire sur la vitrine :
  // il arrive directement dans l'app (recordLanding a déjà compté ci-dessus).
  if (user && isMember) redirect(`/r/${restaurantId}/dashboard`);
  const isKraainem = restaurantId === "kraainem";
  const logo = logoPublicUrl(branding.logo_url);
  // ADR 0042, amendé par ADR 0043 — aperçu par nom d'article (jamais de
  // seuil ni d'euro) sur la carte hero.
  const tierPreview = await getLandingTierPreview(restaurantId);

  return (
    <div className="min-h-screen bg-white">
      <TrackOnMount
        event="restaurant_landing_viewed"
        params={{ restaurant_id: restaurantId, entry_source: utmSource ?? "direct" }}
      />
      {/* ── HERO ── */}
      {/* Minimum vital (retour terrain, 2026-08-30) : un seul titre avant la
          carte d'action — logo, sous-titre, description, tags et adresse
          retirés pour ne pas retarder le geste de scanner. Le nom du resto
          reste visible en pied de page. */}
      <div className="bg-white text-gray-900">
        <div className="max-w-lg mx-auto px-5 pt-14 pb-14 text-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={restaurant.name} className="block mx-auto h-14 w-auto object-contain mb-6" />
          ) : null}
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight">
            Transformer<br />
            son ticket en<br />
            récompenses
          </h1>
        </div>
      </div>

      {/* ── CARTE : CE QUE CE TICKET PEUT DÉBLOQUER + CTA + ÉTAPES ── */}
      <div className="max-w-lg mx-auto px-5 -mt-10 relative z-10">
        <div className="bg-white rounded-3xl shadow-xl p-6">
          {!user ? (
            // ADR 0040 — le client au comptoir a un ticket en main : le scan
            // est l'action n°1, le compte viendra au moment de l'envoi.
            <Link
              href={`/r/${restaurantId}/submit-order`}
              className="flex items-center justify-center gap-2 w-full bg-brand-red text-white text-center py-5 rounded-full font-bold text-xl hover:bg-brand-red/85 transition-colors shadow-lg mb-6"
            >
              Scanner mon ticket <Scan className="w-6 h-6" strokeWidth={2.5} />
            </Link>
          ) : isMember ? (
            <Link
              href={`/r/${restaurantId}/dashboard`}
              className="block w-full bg-brand-red text-white text-center py-5 rounded-full font-bold text-xl hover:bg-brand-red/85 transition-colors shadow-lg mb-6"
            >
              Continuer →
            </Link>
          ) : (
            <form action={joinRestaurant.bind(null, restaurantId)} className="mb-6">
              <button
                type="submit"
                className="w-full bg-brand-red text-white text-center py-5 rounded-full font-bold text-xl hover:bg-brand-red/85 transition-colors shadow-lg"
              >
                Rejoindre {restaurant.name} →
              </button>
            </form>
          )}

          {tierPreview.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-4">
                Ce que ce ticket peut débloquer
              </p>
              <div className="space-y-3">
                {tierPreview.map((row) => (
                  <div key={row.layer} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                    <span className="text-xl">{TIER_COPY[row.layer].icon}</span>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{row.productName}</p>
                      <p className="text-gray-400 text-xs">{TIER_COPY[row.layer].hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-6 space-y-2">
            {STEPS.map((step) => (
              <p key={step.num} className="text-sm text-gray-500">
                <span className="font-bold text-gray-900">{step.num}</span> · {step.desc}
              </p>
            ))}
          </div>
        </div>

        {!user && (
          <form action={redirectToLogin.bind(null, restaurantId)} className="mt-4 text-center">
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
              Déjà membre ? <span className="font-semibold underline">Se connecter</span>
            </button>
          </form>
        )}
      </div>

      <div className="h-10" />

      {/* ── TOP 5 ÉQUIPES ── */}
      {/* Masqué pour Kraainem le temps de valider si le concept d'équipe
          prend (retour restaurateur, 2026-08-10) — réactivable en retirant
          isKraainem de cette condition. */}
      {!isKraainem && top5.length > 0 && (
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
                      {Number(entry.score).toLocaleString("fr-BE", { maximumFractionDigits: 0 })} pts
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
          <h2 className="text-3xl font-black mb-3">Pas encore de ticket ?</h2>
          <p className="text-red-100 mb-8 leading-relaxed">
            Installe déjà l&apos;application, il y a déjà des points à gagner.
          </p>
          {!user ? (
            <form action={redirectToLogin.bind(null, restaurantId)}>
              <button
                type="submit"
                className="inline-block bg-white text-brand-red font-black text-lg px-8 py-4 rounded-2xl hover:bg-red-50 transition-colors shadow-lg"
              >
                S&apos;inscrire directement →
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
        <div className="max-w-lg mx-auto px-5 mt-4 pt-4 border-t border-white/10 text-center text-[11px] text-gray-500">
          Launched by{" "}
          <a
            href="https://www.boosteats.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-gold hover:underline font-semibold"
          >
            BOOSTEATS
          </a>
        </div>
      </footer>
    </div>
  );
}
