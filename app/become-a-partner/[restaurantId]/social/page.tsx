import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, isRestaurantOwner } from "@/lib/restaurant";
import { SocialLinksForm } from "./SocialLinksForm";
import { AnalyticsIdentity } from "@/components/analytics/AnalyticsIdentity";

// Étape 4/4 de l'onboarding — optionnelle : alimente les actions sociales
// (Carte Actions) du dashboard membre. Skippable, toujours reconfigurable
// plus tard depuis /admin/[restaurantId]/settings.
export default async function OnboardingSocialPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const owner = await isRestaurantOwner(user.id, restaurantId);
  if (!owner) notFound();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-10">
      {/* Page réservée au propriétaire : le montage prouve la session,
          ce qui libère l'événement d'étape mis en file (voir analytics-pending). */}
      <AnalyticsIdentity status="restaurateur" />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">📱</p>
          <h1 className="text-2xl font-bold text-gray-900">Tes réseaux sociaux</h1>
          <p className="text-gray-500 text-sm mt-1">
            Étape 4/4 (optionnelle) — ajoute tes liens pour que tes clients puissent
            te suivre et te laisser un avis en un tap depuis l&apos;app.
          </p>
        </div>

        <SocialLinksForm
          restaurantId={restaurantId}
          initial={{
            google_maps_url: restaurant.google_maps_url,
            instagram_url: restaurant.instagram_url,
            tiktok_url: restaurant.tiktok_url,
            facebook_url: restaurant.facebook_url,
          }}
        />
      </div>
    </div>
  );
}
