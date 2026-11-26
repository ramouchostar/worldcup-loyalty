"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/admin/ui";
import { SiteOrdersBoard } from "@/components/admin/site-orders/SiteOrdersBoard";
import { NinaAlerts } from "@/components/admin/site-orders/NinaAlerts";
import { WhatsAppSetting } from "@/components/admin/site-orders/WhatsAppSetting";

// ADR 0099 §2 — les commandes passées sur le site du restaurant (retrait et paiement au comptoir).
export default function SiteOrdersPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  return (
    <div className="space-y-5">
      <PageHeader title="Commandes du site" subtitle="Nina reçoit ici les commandes de ton site : tu prépares, tu dis « prête », ils viennent payer et retirer au comptoir." />
      <NinaAlerts restaurantId={restaurantId} />
      <Link href={`/admin/${restaurantId}/commandes-du-site/rapport`} className="inline-flex min-h-[44px] items-center rounded-lg border border-paper-border bg-white px-4 text-[15px] font-semibold text-ink hover:border-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
        Voir le rapport de la semaine
      </Link>
      <WhatsAppSetting restaurantId={restaurantId} />
      <SiteOrdersBoard restaurantId={restaurantId} />
    </div>
  );
}
