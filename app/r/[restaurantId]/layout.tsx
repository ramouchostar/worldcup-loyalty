import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant } from "@/lib/restaurant";
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

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: membershipsRaw } = user
    ? await supabase
        .from("memberships")
        .select("restaurant_id, restaurants(id, name)")
        .eq("user_id", user.id)
    : { data: null };

  const restaurants = (
    (membershipsRaw as unknown as { restaurants: { id: string; name: string } | null }[]) ?? []
  )
    .map((m) => m.restaurants)
    .filter((r): r is { id: string; name: string } => !!r);

  return (
    <RestaurantProvider value={{ id: restaurant.id, name: restaurant.name }}>
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <RestaurantSwitcher
            current={{ id: restaurant.id, name: restaurant.name }}
            restaurants={restaurants.length > 0 ? restaurants : [{ id: restaurant.id, name: restaurant.name }]}
          />
          {user ? (
            <UserNav email={user.email ?? ""} />
          ) : (
            <Link
              href="/login"
              className="text-sm bg-brand-red px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
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
