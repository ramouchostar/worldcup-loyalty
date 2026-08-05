import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, getRestaurantBranding, getRestaurantId } from "@/lib/restaurant";
import { brandStyle } from "@/lib/branding";
import { UserNav } from "@/components/member/UserNav";
import { InAppNotificationBanner } from "@/components/member/InAppNotificationBanner";
import { BottomNav } from "@/components/member/BottomNav";
import { RestaurantSwitcher } from "@/components/member/RestaurantSwitcher";
import { RestaurantProvider } from "@/components/member/RestaurantContext";

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

  const [{ data: membershipsRaw }, { data: profileRaw }, { data: ownedRaw }] = user
    ? await Promise.all([
        supabase
          .from("memberships")
          .select("restaurant_id, restaurants(id, name)")
          .eq("user_id", user.id),
        supabase.from("profiles").select("is_admin, is_super_admin").eq("id", user.id).single(),
        supabase.from("restaurants").select("id").eq("owner_id", user.id),
      ])
    : [{ data: null }, { data: null }, { data: null }];
  const profile = profileRaw as { is_admin: boolean; is_super_admin: boolean } | null;
  const isSuperAdmin = !!profile?.is_super_admin;

  // ADR 0030 §2 — pont membre → admin : « Ma console » dans le UserNav.
  // Owner du resto courant (ou admin legacy sur le resto par défaut) → sa
  // console directe ; owner d'autres établissements → le sélecteur /admin.
  const ownedIds = ((ownedRaw as { id: string }[] | null) ?? []).map((o) => o.id);
  const isAdminOfCurrent =
    ownedIds.includes(restaurantId) || (!!profile?.is_admin && restaurantId === getRestaurantId());
  const adminHref = isAdminOfCurrent
    ? `/admin/${restaurantId}`
    : ownedIds.length > 0 || profile?.is_admin
      ? "/admin"
      : null;

  const restaurants = (
    (membershipsRaw as unknown as { restaurants: { id: string; name: string } | null }[]) ?? []
  )
    .map((m) => m.restaurants)
    .filter((r): r is { id: string; name: string } => !!r);

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
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <RestaurantSwitcher
            current={{ id: restaurant.id, name: restaurant.name }}
            restaurants={restaurants.length > 0 ? restaurants : [{ id: restaurant.id, name: restaurant.name }]}
          />
          {user ? (
            <UserNav email={user.email ?? ""} isSuperAdmin={isSuperAdmin} adminHref={adminHref} />
          ) : (
            <Link
              href="/login"
              className="text-sm bg-brand-red px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-red/85 transition-colors"
            >
              Rejoindre →
            </Link>
          )}
        </div>
      </header>

      {user && <InAppNotificationBanner />}

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
