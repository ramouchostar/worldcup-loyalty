import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { ThresholdsClient } from "./ThresholdsClient";

// ADR 0040 §6 — wrapper serveur : réservé à gérant/manager (+ pont legacy),
// un siège équipe ne doit même pas voir ces montants. Défense en profondeur
// derrière la garde de route API (requireEstablishmentManager) — même
// raisonnement que le layout admin (CVE-2025-29927) : la garde ne peut pas
// reposer sur le seul lien caché dans la nav.
export default async function AdminThresholdsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getAdminAccess(user.id, restaurantId);
  if (!canManageEstablishment(access)) {
    return (
      <div className="max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Accès réservé</h1>
        <p className="text-sm text-gray-500">Réservé aux gérants et managers de cet établissement.</p>
      </div>
    );
  }

  return <ThresholdsClient />;
}
