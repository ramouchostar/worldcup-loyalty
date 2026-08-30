import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, getRestaurantBranding, getRestaurantId, logoPublicUrl } from "@/lib/restaurant";
import { brandStyle } from "@/lib/branding";
import { pointsForOrder } from "@/lib/points-model";
import { TOKENS_PER_PORTION } from "@/lib/social-actions";
import { COIN_EMOJI, TICKET_EMOJI } from "@/lib/fluent-emoji";
import { HeaderMenu } from "@/components/member/HeaderMenu";
import { InAppNotificationBanner } from "@/components/member/InAppNotificationBanner";
import { AppInstallBeacon } from "@/components/member/AppInstallBeacon";
import { BottomNav } from "@/components/member/BottomNav";
import { RestaurantProvider } from "@/components/member/RestaurantContext";
import { AnalyticsIdentity } from "@/components/analytics/AnalyticsIdentity";

export default async function RestaurantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  // Charte graphique de l'établissement (m37) — surcharge les couleurs de
  // marque sur toutes ses surfaces membre. Défauts Boosteats si aucune charte.
  const branding = await getRestaurantBranding(restaurantId);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: membershipsRaw }, { data: profileRaw }, { data: ownedRaw }, { data: seatsRaw }] = user
    ? await Promise.all([
        supabase
          .from("memberships")
          .select("restaurant_id, restaurants(id, name)")
          .eq("user_id", user.id),
        supabase.from("profiles").select("is_admin, is_super_admin").eq("id", user.id).single(),
        supabase.from("restaurants").select("id").eq("owner_id", user.id),
        // ADR 0041 — sièges restaurant_admins (gérant/manager/équipe), lisibles
        // via RLS self-read sans clé service-role.
        supabase.from("restaurant_admins").select("restaurant_id").eq("user_id", user.id),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }];
  const profile = profileRaw as { is_admin: boolean; is_super_admin: boolean } | null;
  const isSuperAdmin = !!profile?.is_super_admin;

  // ADR 0030 §2 + ADR 0041 — pont membre → admin : « Ma console » dans le
  // HeaderMenu. Admin (owner, siège, ou admin legacy sur le resto par défaut) du
  // resto courant → sa console directe ; admin d'autres établissements → le
  // sélecteur /admin.
  const ownedIds = ((ownedRaw as { id: string }[] | null) ?? []).map((o) => o.id);
  const seatRestaurantIds = ((seatsRaw as { restaurant_id: string }[] | null) ?? []).map((s) => s.restaurant_id);
  const adminRestaurantIds = Array.from(new Set([...ownedIds, ...seatRestaurantIds]));
  const isAdminOfCurrent =
    adminRestaurantIds.includes(restaurantId) || (!!profile?.is_admin && restaurantId === getRestaurantId());
  const adminHref = isAdminOfCurrent
    ? `/admin/${restaurantId}`
    : adminRestaurantIds.length > 0 || profile?.is_admin
      ? "/admin"
      : null;

  const restaurants = (
    (membershipsRaw as unknown as { restaurants: { id: string; name: string } | null }[]) ?? []
  )
    .map((m) => m.restaurants)
    .filter((r): r is { id: string; name: string } => !!r);

  const logo = logoPublicUrl(branding.logo_url);

  // Compteurs du bandeau — points de fidélité (pointsForOrder, ADR 0028,
  // même calcul que "Tes points" au dashboard) + jetons (actions sociales
  // validées + parrainage/5, même formule que ActionsLadder et la page
  // Actions). Toujours en points/jetons, jamais en euros (ADR 0007).
  const [{ data: validatedOrdersData }, { count: socialValidatedCount }, { count: referralCount }] = user
    ? await Promise.all([
        supabase
          .from("orders")
          .select("amount")
          .eq("user_id", user.id)
          .eq("restaurant_id", restaurantId)
          .eq("status", "validated"),
        supabase
          .from("micro_reward_claims")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("restaurant_id", restaurantId)
          .eq("status", "validated"),
        supabase
          .from("referrals")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", user.id)
          .eq("restaurant_id", restaurantId),
      ])
    : [{ data: null }, { count: null }, { count: null }];
  const totalPoints = ((validatedOrdersData as { amount: number }[] | null) ?? []).reduce(
    (s, o) => s + pointsForOrder(Number(o.amount)),
    0
  );
  const referralTokens = Math.floor((referralCount ?? 0) / 5);
  const totalTokens = Math.min((socialValidatedCount ?? 0) + referralTokens, TOKENS_PER_PORTION);

  return (
    <RestaurantProvider
      value={{
        id: restaurant.id,
        name: restaurant.name,
        google_maps_url: restaurant.google_maps_url,
        instagram_url: restaurant.instagram_url,
        tiktok_url: restaurant.tiktok_url,
        facebook_url: restaurant.facebook_url,
      }}
    >
    <div className="min-h-screen bg-gray-50 font-brand" style={brandStyle(branding)}>
      {/* Anonyme : la vitrine post-scan (ADR 0042) est pensée sans chrome de
          navigation (switcher inter-établissements, "Rejoindre" redondant
          avec le CTA de la page) — ce header ne sert qu'un membre connecté. */}
      {user && (
        <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10 pt-safe">
          <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
            {/* Spacer côté gauche : même largeur que le bouton ☰ pour que le
                logo/nom au centre reste visuellement centré. */}
            <div aria-hidden="true" />
            <Link
              href={`/r/${restaurant.id}/dashboard`}
              className="flex items-center justify-center gap-2 min-w-0 font-bold text-lg tracking-tight"
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
              ) : (
                <span aria-hidden="true">🍗</span>
              )}
              {/* Blanc forcé, pas text-brand-gold : pour Kraainem ce token
                  résout en rouge (brand_accent), lu comme un signal de
                  danger sur fond sombre — jamais de texte rouge côté
                  client. */}
              <span className="text-white truncate">{restaurant.name}</span>
            </Link>
            <div className="flex justify-end">
              <HeaderMenu
                email={user.email ?? ""}
                isSuperAdmin={isSuperAdmin}
                adminHref={adminHref}
                current={{ id: restaurant.id, name: restaurant.name }}
                restaurants={restaurants.length > 0 ? restaurants : [{ id: restaurant.id, name: restaurant.name }]}
              />
            </div>
          </div>

          {/* Compteurs — points de fidélité + jetons, toujours visibles en
              un coup d'œil. Pastilles translucides (pas de fond plein) pour
              rester lisibles sur la charte de n'importe quel établissement. */}
          <div className="max-w-2xl mx-auto px-4 pb-2.5 flex items-center justify-center gap-2">
            <span className="flex items-center gap-1.5 bg-white/10 rounded-full pl-1.5 pr-2.5 py-1 text-xs font-bold text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={COIN_EMOJI} alt="" className="w-4 h-4" />
              {totalPoints.toLocaleString("fr-BE")}
            </span>
            <span className="flex items-center gap-1.5 bg-white/10 rounded-full pl-1.5 pr-2.5 py-1 text-xs font-bold text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={TICKET_EMOJI} alt="" className="w-4 h-4" />
              {totalTokens}/{TOKENS_PER_PORTION}
            </span>
          </div>
        </header>
      )}

      {/* Atteindre cette branche prouve la session — c'est ce qui autorise
          l'émission de `sign_up` / `login` mis en attente par le formulaire. */}
      {user && <AnalyticsIdentity status="membre" />}

      {user && <InAppNotificationBanner />}
      {/* Mesure d'installation de l'app (complément ADR 0038) — rend null */}
      {user && <AppInstallBeacon />}

      <main className="max-w-2xl mx-auto px-4 py-6" id="main-content">
        {children}
      </main>

      {user && (
        <>
          <BottomNav restaurantId={restaurantId} />
          <div style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }} />
        </>
      )}
    </div>
    </RestaurantProvider>
  );
}
