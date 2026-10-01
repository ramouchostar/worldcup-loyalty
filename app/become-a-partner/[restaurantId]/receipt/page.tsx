import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, isRestaurantOwner } from "@/lib/restaurant";
import { ReceiptSetupForm } from "./ReceiptSetupForm";
import { AnalyticsIdentity } from "@/components/analytics/AnalyticsIdentity";
import { PARTNER_PROGRESS_PATH, siblingsMissing, establishmentsWith } from "@/lib/partner-signup";
import { Stepper } from "../../PartnerSignup";
import { ReuseFrom } from "../../ReuseFrom";
import { copyReceiptFormatFrom } from "../../actions";

// L'analyse des tickets d'exemple (claude-sonnet-5, 2-3 images) dépasse le
// timeout serverless par défaut — la server action hérite de ce segment.
export const maxDuration = 60;

// Étape 3/4 de l'onboarding (ADR 0019) — découverte de la clé unique qui
// identifie une commande sur le format de ticket de cet établissement.
export default async function OnboardingReceiptPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const owner = await isRestaurantOwner(user.id, restaurantId);
  if (!owner) notFound();

  // ADR 0075 §2 — ses autres établissements encore sans ticket.
  const siblings = await siblingsMissing(user.id, restaurantId, "ticket");
  // ADR 0075 §6 — ou reprendre ce qu'un établissement existant a déjà.
  const sources = await establishmentsWith(user.id, restaurantId, "ticket");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-10">
      {/* Page réservée au propriétaire : le montage prouve la session,
          ce qui libère l'événement d'étape mis en file (voir analytics-pending). */}
      <AnalyticsIdentity status="restaurateur" />
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <Stepper current={4} />
        </div>
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Les tickets de {restaurant.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Envoyez 2 ou 3 photos de tickets récents. On y repère le numéro qui identifie
            chaque commande, pour reconnaître les tickets de vos clients sans jamais compter
            deux fois la même commande.
          </p>
        </div>

        <ReuseFrom sources={sources} action={copyReceiptFormatFrom.bind(null, restaurantId)} what="caisse" />
        <ReceiptSetupForm restaurantId={restaurantId} siblings={siblings} />

        {/* ADR 0075 §1 — « Ajouter plus tard » ; ADR 0030 §5 — le parent
            logique est la page d'avancement. */}
        <p className="text-center mt-4">
          <Link href={PARTNER_PROGRESS_PATH} className="text-sm font-semibold text-gray-500 hover:text-gray-800 underline">
            Ajouter plus tard
          </Link>
        </p>
      </div>
    </div>
  );
}
