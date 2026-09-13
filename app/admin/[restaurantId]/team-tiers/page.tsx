import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { TeamTiersClient } from "./TeamTiersClient";
import { Restricted } from "@/components/admin/ui";

// ADR 0041 §6 — wrapper serveur : réservé à gérant/manager (+ pont legacy),
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
      <Restricted />
    );
  }

  return <TeamTiersClient />;
}
