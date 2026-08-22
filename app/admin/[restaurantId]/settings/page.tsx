import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantBranding, logoPublicUrl } from "@/lib/restaurant";
import { listTeamSuggestions } from "@/lib/teams";
import { getSchoolCalendars } from "@/lib/school-calendar";
import { SettingsForm } from "./SettingsForm";
import { BrandingForm } from "./BrandingForm";
import { CommunitiesForm } from "./CommunitiesForm";

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

  const [branding, suggestions, schoolCalendars] = await Promise.all([
    getRestaurantBranding(restaurantId),
    listTeamSuggestions(restaurantId),
    getSchoolCalendars(admin, restaurantId),
  ]);

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
          school_calendars: schoolCalendars,
          google_maps_url: restaurant.google_maps_url ?? "",
          website_url: restaurant.website_url ?? "",
          instagram_url: restaurant.instagram_url ?? "",
          tiktok_url: restaurant.tiktok_url ?? "",
          facebook_url: restaurant.facebook_url ?? "",
        }}
      />

      {/* ADR 0031 — source de vérité des propositions d'équipe côté membre */}
      <CommunitiesForm
        restaurantId={restaurantId}
        initial={suggestions.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          zone: s.zone,
          materialized: !!s.team_id,
        }))}
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
