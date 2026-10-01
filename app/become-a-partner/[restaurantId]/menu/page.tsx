import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, isRestaurantOwner } from "@/lib/restaurant";
import { MenuUploadForm } from "./MenuUploadForm";
import { AnalyticsIdentity } from "@/components/analytics/AnalyticsIdentity";
import { siblingsMissing } from "@/lib/partner-signup";
import { Stepper } from "../../PartnerSignup";

export default async function OnboardingMenuPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const owner = await isRestaurantOwner(user.id, restaurantId);
  if (!owner) notFound();

  // ADR 0075 §2 — ses autres établissements encore sans carte.
  const siblings = await siblingsMissing(user.id, restaurantId, "menu");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-10">
      {/* Page réservée au propriétaire : le montage prouve la session,
          ce qui libère l'événement d'étape mis en file (voir analytics-pending). */}
      <AnalyticsIdentity status="restaurateur" />
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <Stepper current={3} />
        </div>
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">La carte de {restaurant.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Elle sert à proposer des cadeaux pris dans ce que vous vendez. Prix et coûts restent
            internes, jamais visibles des clients.
          </p>
        </div>

        <MenuUploadForm restaurantId={restaurantId} siblings={siblings} />

        {/* ADR 0075 §1 — « Ajouter plus tard » : on passe au ticket ; la page
            d'avancement rappellera la carte. */}
        <p className="text-center mt-4">
          <Link href={`/become-a-partner/${restaurantId}/receipt`} className="text-sm font-semibold text-gray-500 hover:text-gray-800 underline">
            Ajouter plus tard
          </Link>
        </p>
      </div>
    </div>
  );
}
