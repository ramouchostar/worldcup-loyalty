import { notFound, redirect } from "next/navigation";
import { OffersConsole } from "@/components/admin/site-offers/OffersConsole";
import { BackLink } from "@/components/admin/site-orders/info-ui";
import { Restricted } from "@/components/admin/ui";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { createServerSupabaseClient } from "@/lib/supabase";
import { siteOrdersAvailable } from "@/lib/site-orders/access";

export const metadata = { title: "Offres de ta page" };

// ADR 0110 — « Offres de ta page ». Tout siège la voit (arrêter se fait au comptoir) ; écrire et publier sont réservés au
// gérant et au manager, par l'API. Mêmes portes que les commandes du site (le drapeau et le forfait).
export default async function SiteOffersPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) return <Restricted />;
  if (!(await siteOrdersAvailable(restaurantId))) notFound();

  return (
    <div className="max-w-lg space-y-4">
      <BackLink href={`/admin/${restaurantId}/commandes-du-site`} label="Commandes du site" />
      <OffersConsole restaurantId={restaurantId} />
    </div>
  );
}
