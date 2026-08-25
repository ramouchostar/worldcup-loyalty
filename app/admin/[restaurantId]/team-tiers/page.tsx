import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { TeamTiersClient } from "./TeamTiersClient";

// ADR 0040 §6 — wrapper serveur : réservé à gérant/manager (+ pont legacy),
// mêmes raisons que thresholds/page.tsx (seuils en euros ADR 0012, jamais
// visibles côté client, mais aussi restreints à ces rôles côté admin
// désormais). Défense en profondeur derrière requireEstablishmentManager.
export default async function AdminTeamTiersPage({ params }: { params: Promise<{ restaurantId: string }> }) {
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

  return <TeamTiersClient />;
}
