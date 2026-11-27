import { notFound, redirect } from "next/navigation";
import { PageHeader, Restricted } from "@/components/admin/ui";
import { BackLink } from "@/components/admin/site-orders/info-ui";
import { PageInfoView } from "@/components/admin/site-orders/PageInfoView";
import { canManageEstablishment, getAdminAccess } from "@/lib/admin-guard";
import { createServerSupabaseClient } from "@/lib/supabase";
import { siteOrdersAvailable } from "@/lib/site-orders/access";

// ADR 0109 §3 — « Infos de ma page » : ce que les clients voient quand ils commandent. Gérant et manager seulement, mêmes
// portes que les commandes du site (le drapeau et le forfait).
export default async function SiteInfoPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!canManageEstablishment(await getAdminAccess(user.id, restaurantId))) return <Restricted />;
  if (!(await siteOrdersAvailable(restaurantId))) notFound();

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <BackLink href={`/admin/${restaurantId}/commandes-du-site`} label="Commandes du site" />
        <PageHeader title="Infos de ma page" subtitle="Ce que tes clients voient quand ils commandent." />
      </div>
      <PageInfoView restaurantId={restaurantId} />
    </div>
  );
}
