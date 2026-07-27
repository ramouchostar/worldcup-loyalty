import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant, isRestaurantOwner } from "@/lib/restaurant";
import { MenuUploadForm } from "./MenuUploadForm";

export default async function OnboardingMenuPage({ params }: { params: Promise<{ restaurantId: string }> }) {
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
          <p className="text-4xl mb-2">🧾</p>
          <h1 className="text-2xl font-bold text-gray-900">Le catalogue de {restaurant.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Étape 2/3 — soumets ton menu avec les coûts. Ces données restent internes,
            jamais visibles des clients.
          </p>
        </div>

        <MenuUploadForm restaurantId={restaurantId} />

        {/* Sortie in-app : ne pas piéger le restaurateur sans CSV prêt — il
            pourra compléter son catalogue depuis l'admin (audit UX 2026-07). */}
        <p className="text-center mt-4">
          <Link href={`/admin/${restaurantId}`} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Configurer plus tard →
          </Link>
        </p>
      </div>
    </div>
  );
}
