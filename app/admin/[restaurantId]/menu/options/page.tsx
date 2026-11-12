"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/admin/ui";
import { OptionsEditor } from "@/components/admin/menu-options/OptionsEditor";

// ADR 0100 — régler les options des plats (taille, sauces, suppléments, « sans ») par groupes de plats.
export default function MenuOptionsPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Options de mes plats"
        subtitle={<>Une option, c&apos;est un choix du client : la sauce, la taille, un supplément, ce qu&apos;il ne veut pas. Passe la souris sur les petits « ? » pour lire à quoi ils servent.</>}
        action={<Link href={`/admin/${restaurantId}/menu`} className="text-[13px] font-semibold text-ink underline">Retour à Menu et coûts</Link>}
      />
      <OptionsEditor restaurantId={restaurantId} />
    </div>
  );
}
