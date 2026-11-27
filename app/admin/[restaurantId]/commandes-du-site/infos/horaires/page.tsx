import { notFound, redirect } from "next/navigation";
import { PageHeader, Restricted } from "@/components/admin/ui";
import { HoursEditor } from "@/components/admin/site-orders/HoursEditor";
import { BackLink } from "@/components/admin/site-orders/info-ui";
import { canManageEstablishment, getAdminAccess } from "@/lib/admin-guard";
import { createServerSupabaseClient } from "@/lib/supabase";
import { siteOrdersAvailable } from "@/lib/site-orders/access";

// ADR 0109 §3 — « Mes horaires » : ceux de Google ou les siens, et les jours spéciaux. Gérant et manager seulement.
export default async function SiteHoursPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!canManageEstablishment(await getAdminAccess(user.id, restaurantId))) return <Restricted />;
  if (!(await siteOrdersAvailable(restaurantId))) notFound();

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <BackLink href={`/admin/${restaurantId}/commandes-du-site/infos`} label="Infos de ma page" />
        <PageHeader title="Mes horaires" />
      </div>
      <HoursEditor restaurantId={restaurantId} />
    </div>
  );
}
