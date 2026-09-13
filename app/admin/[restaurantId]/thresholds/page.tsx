import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { ThresholdsClient } from "./ThresholdsClient";
import { Restricted } from "@/components/admin/ui";

// ADR 0041 §6 — wrapper serveur : réservé à gérant/manager (+ pont legacy),
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
      <Restricted />
    );
  }

  return <ThresholdsClient />;
}
