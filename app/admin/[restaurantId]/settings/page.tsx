import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { SettingsForm } from "./SettingsForm";
import { BrandingForm } from "./BrandingForm";

// « Mon établissement » — édition des infos publiques et des liens sociaux
// après l'onboarding (elles n'étaient modifiables nulle part jusqu'ici).
export default async function AdminSettingsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, name, sector, address, cuisine_types, google_maps_url, website_url, instagram_url, tiktok_url, facebook_url")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!restaurant) notFound();

  const branding = await getRestaurantBranding(restaurantId);

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon établissement</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ces infos apparaissent sur ta page publique et alimentent les actions
          sociales de tes membres.
        </p>
      </div>

      <SettingsForm
        restaurantId={restaurantId}
        initial={{
          name: restaurant.name ?? "",
          sector: restaurant.sector ?? "",
          address: restaurant.address ?? "",
          cuisine_types: (restaurant.cuisine_types ?? []).join(", "),
          google_maps_url: restaurant.google_maps_url ?? "",
          website_url: restaurant.website_url ?? "",
          instagram_url: restaurant.instagram_url ?? "",
          tiktok_url: restaurant.tiktok_url ?? "",
          facebook_url: restaurant.facebook_url ?? "",
        }}
      />

      <BrandingForm
        restaurantId={restaurantId}
        websiteUrl={restaurant.website_url ?? null}
        initial={{
          brand_primary: branding.brand_primary ?? "",
          brand_dark: branding.brand_dark ?? "",
          brand_accent: branding.brand_accent ?? "",
          brand_font: branding.brand_font ?? "",
          logo_url: logoPublicUrl(branding.logo_url),
          hero_image_url: logoPublicUrl(branding.hero_image_url),
        }}
      />
    </div>
  );
}
