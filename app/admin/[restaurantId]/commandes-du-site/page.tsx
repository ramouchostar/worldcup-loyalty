"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/admin/ui";
import { SiteOrdersBoard } from "@/components/admin/site-orders/SiteOrdersBoard";

// ADR 0099 §2 — les commandes passées sur le site du restaurant (retrait et paiement au comptoir).
export default function SiteOrdersPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  return (
    <div className="space-y-5">
      <PageHeader title="Commandes du site" subtitle="Ce que tes clients ont commandé sur ton site : tu prépares, tu dis « prête », ils viennent payer et retirer au comptoir." />
      <SiteOrdersBoard restaurantId={restaurantId} />
    </div>
  );
}
