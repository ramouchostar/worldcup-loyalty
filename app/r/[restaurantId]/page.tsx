import { notFound, redirect } from "next/navigation";
import { CLOCK_EMOJI } from "@/lib/fluent-emoji";
import Link from "next/link";
import { getLandingOffer } from "@/lib/landing-offer";
import { menuImageUrl } from "@/lib/menu-images";
import { getTeamsHidden } from "@/lib/teams";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, isRestaurantOwner, getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { joinRestaurant } from "@/app/join/actions";
import { redirectToLogin } from "./actions";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { PendingTicketBanner } from "@/components/member/PendingTicketBanner";
import { ScanTicketCta } from "@/components/member/ScanTicketCta";
import { foodIconUrl } from "@/lib/food-icon";
import { recordStaffLanding } from "@/lib/staff-codes";
import { recordLanding } from "@/lib/qr-funnel";
import { COIN_EMOJI, PEOPLE_EMOJI, RECEIPT_EMOJI } from "@/lib/fluent-emoji";
import type { CommunityScore, Team } from "@/types";

type LeaderboardRow = Omit<CommunityScore, "total_spent"> & {
  teams: Pick<Team, "name" | "flag_emoji" | "is_active">;
};

export default async function RestaurantLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ utm_source?: string; p?: string }>;
}) {
  const { restaurantId } = await params;
  // Cible des QR imprimés : le `utm_source=qr_code` posé sur les liens encodés
  // permet de séparer un scan en salle d'une arrivée par lien partagé.
  // `p` = code d'un membre du personnel (ADR 0053) — le cookie est posé par le
  // middleware, ici on ne fait que COMPTER l'arrivée par prénom.
  const { utm_source: utmSource, p: staffCode } = await searchParams;
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CLOCK_EMOJI} alt="" className="w-14 h-14 mx-auto mb-3" />
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
  // ADR 0053 — la même arrivée comptée par PRÉNOM du personnel, en plus de
  // l'entonnoir général. Best-effort, jamais bloquant.
  if (staffCode) await recordStaffLanding(restaurantId, staffCode);

  const top5 = ((scoresRaw as unknown as LeaderboardRow[]) ?? []).filter((s) => s.teams?.is_active);
  const isMember = !!membership;
  // ADR 0040 — un membre qui rescanne le QR n'a rien à faire sur la vitrine :
  // il arrive directement dans l'app (recordLanding a déjà compté ci-dessus).
  if (user && isMember) redirect(`/r/${restaurantId}/dashboard`);
  // Étape 10 onboarding — le masquage des équipes est un flag par resto
  // (restaurants.teams_hidden, kraainem par défaut) au lieu du hardcode :
  // il pilote aussi la question d'équipe (getTeamPrompt).
  const teamsHidden = await getTeamsHidden(restaurantId);
  const logo = logoPublicUrl(branding.logo_url);
  // ADR 0062 — ce que le ticket rapporte VRAIMENT : cadeau d'accueil,
  // points et catalogue, cadeaux d'équipe. Jamais d'euro ni de taux.
  const offer = await getLandingOffer(restaurantId);

  return (
    <div className="min-h-screen bg-white">
      <TrackOnMount
        event="restaurant_landing_viewed"
        params={{ restaurant_id: restaurantId, entry_source: utmSource ?? "direct" }}
      />
      {/* ── HERO ── */}
      {/* Minimum vital (retour terrain, 2026-08-30) : un seul titre avant la
          carte d'action — logo, sous-titre, description, tags et adresse
          retirés pour ne pas retarder la photo du ticket. Le nom du resto
          reste visible en pied de page. */}
      <div className="bg-white text-gray-900 relative overflow-hidden">
        {/* Illustrations décoratives (retour terrain, 2026-08-30) — jamais
            devant le texte (z-0, pointer-events-none, décoratif pour les
            lecteurs d'écran). */}
        {/* eslint-disable @next/next/no-img-element */}
        <img
          src={COIN_EMOJI}
          alt=""
          aria-hidden="true"
          className="absolute -top-4 -right-4 w-24 h-24 rotate-[18deg] pointer-events-none select-none z-0"
        />
        <img
          src={RECEIPT_EMOJI}
          alt=""
          aria-hidden="true"
          className="absolute top-6 -left-4 w-20 h-20 -rotate-[15deg] pointer-events-none select-none z-0"
        />
        <img
          src={COIN_EMOJI}
          alt=""
          aria-hidden="true"
          className="absolute bottom-0 right-8 w-16 h-16 -rotate-12 pointer-events-none select-none z-0"
        />
        {/* eslint-enable @next/next/no-img-element */}
        <div className="max-w-lg mx-auto px-5 pt-14 pb-14 text-center relative z-10">
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
          {/* Reprise du ticket en attente (audit 2026-09-04) — invisible si
              aucune photo fraîche ne dort en IndexedDB. */}
          <PendingTicketBanner restaurantId={restaurantId} />
          {!user ? (
            // ADR 0040 — le client au comptoir a un ticket en main : le scan
            // est l'action n°1, le compte viendra au moment de l'envoi.
            // Capture en un tap (audit 2026-09-04) : le bouton ouvre
            // directement l'appareil photo, la photo suit via ?resume=1.
            <ScanTicketCta restaurantId={restaurantId} />
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

          {(offer.welcome || offer.showcase.length > 0) && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-4">
                Ce que ton ticket te rapporte
              </p>
              <div className="space-y-3">
                {offer.welcome && (
                  <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={menuImageUrl(offer.welcome.imagePath) ?? foodIconUrl(offer.welcome.name)}
                      alt=""
                      className={offer.welcome.imagePath ? "w-12 h-12 shrink-0 rounded-lg object-cover" : "w-10 h-10 shrink-0"}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{offer.welcome.name} offert</p>
                      <p className="text-green-800 text-xs">Pour ton premier ticket</p>
                    </div>
                  </div>
                )}

                {offer.showcase.length > 0 && (
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={COIN_EMOJI} alt="" className="w-9 h-9 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm">Des points à chaque ticket</p>
                        <p className="text-gray-500 text-xs">Tu choisis ton cadeau au catalogue</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mt-3">
                      {offer.showcase.map((item) => (
                        <div key={item.id} className="rounded-lg bg-white border border-gray-100 p-1.5 text-center min-w-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={menuImageUrl(item.imagePath) ?? foodIconUrl(item.name)}
                            alt=""
                            className={item.imagePath ? "w-full aspect-square rounded-md object-cover" : "w-10 h-10 mx-auto"}
                          />
                          <p lang="fr" className="text-[11px] font-semibold text-gray-900 mt-1.5 leading-tight line-clamp-2 hyphens-auto">{item.name}</p>
                          <p className="text-[11px] text-gray-500 tabular-nums">{item.pricePoints.toLocaleString("fr-BE")} points</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Les équipes servent la diffusion ciblée : leurs cadeaux restent
                    annoncés même quand la compétition est masquée (ADR 0059 §4). */}
                {offer.hasTeamGifts && (
                  <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={PEOPLE_EMOJI} alt="" className="w-9 h-9 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm">Des cadeaux d&apos;équipe</p>
                      <p className="text-gray-500 text-xs">À chaque palier franchi, chaque membre reçoit un cadeau</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
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
      {/* Masqué quand l'établissement cache le concept d'équipe (flag
          restaurants.teams_hidden — kraainem depuis le retour restaurateur du
          2026-08-10, réactivable en base sans déploiement). */}
      {!teamsHidden && top5.length > 0 && (
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
            {offer.welcome
              ? <>Inscris-toi déjà : ton premier ticket t&apos;offrira {offer.welcome.name}.</>
              : <>Inscris-toi déjà : ton premier ticket te rapportera des points.</>}
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
