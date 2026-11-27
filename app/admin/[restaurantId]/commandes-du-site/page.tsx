import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { SiteOrdersBoard } from "@/components/admin/site-orders/SiteOrdersBoard";
import { NinaAlerts } from "@/components/admin/site-orders/NinaAlerts";
import { WhatsAppSetting } from "@/components/admin/site-orders/WhatsAppSetting";
import { canManageEstablishment, getAdminAccess } from "@/lib/admin-guard";
import { createServerSupabaseClient } from "@/lib/supabase";

const action = "inline-flex min-h-[44px] items-center rounded-lg border border-paper-border bg-white px-4 text-[15px] font-semibold text-ink hover:border-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

// ADR 0099 §2 — les commandes passées sur le site du restaurant (retrait et paiement au comptoir).
export default async function SiteOrdersPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  // « Infos de ma page » est réservée au gérant et au manager (ADR 0109 §3) : l'équipe ne voit pas le lien.
  const manages = !!user && canManageEstablishment(await getAdminAccess(user.id, restaurantId));
  return (
    <div className="space-y-5">
      <PageHeader title="Commandes du site" subtitle="Nina reçoit ici les commandes de ton site : tu prépares, tu dis « prête », ils viennent payer et retirer au comptoir." />
      <NinaAlerts restaurantId={restaurantId} />
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/${restaurantId}/commandes-du-site/rapport`} className={action}>Voir le rapport de la semaine</Link>
        {/* ADR 0110 — ouverte à tout siège : la personne au comptoir doit pouvoir arrêter une offre. */}
        <Link href={`/admin/${restaurantId}/commandes-du-site/offres`} className={action}>Offres de ta page</Link>
        {manages && <Link href={`/admin/${restaurantId}/commandes-du-site/infos`} className={action}>Infos de ma page</Link>}
      </div>
      <WhatsAppSetting restaurantId={restaurantId} />
      <SiteOrdersBoard restaurantId={restaurantId} />
    </div>
  );
}
