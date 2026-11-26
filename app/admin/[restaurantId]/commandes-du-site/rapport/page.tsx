"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight } from "@/components/icons";
import { PageHeader } from "@/components/admin/ui";
import { WeeklyReportView } from "@/components/admin/site-orders/WeeklyReportView";

// ADR 0108 §6 — le rapport de la semaine de l'espace de commande.
export default function SiteOrdersReportPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  return (
    <div className="space-y-5">
      <div>
        <Link href={`/admin/${restaurantId}/commandes-du-site`} className="inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-boost-olive-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
          <ArrowRight className="h-5 w-5 rotate-180" aria-hidden="true" />
          Commandes du site
        </Link>
        <PageHeader title="Rapport de la semaine" />
      </div>
      <WeeklyReportView restaurantId={restaurantId} />
    </div>
  );
}
