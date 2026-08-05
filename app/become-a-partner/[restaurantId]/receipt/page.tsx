import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, isRestaurantOwner } from "@/lib/restaurant";
import { ReceiptSetupForm } from "./ReceiptSetupForm";

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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">🎫</p>
          <h1 className="text-2xl font-bold text-gray-900">Tes tickets de caisse</h1>
          <p className="text-gray-500 text-sm mt-1">
            Étape 3/4 — envoie 2 ou 3 photos de tickets récents. On y repère le
            numéro qui identifie chaque commande, pour reconnaître les tickets
            de tes clients sans jamais compter deux fois la même commande.
          </p>
        </div>

        <ReceiptSetupForm restaurantId={restaurantId} />
      </div>
    </div>
  );
}
