"use client";

import { useRouter } from "next/navigation";
import { FlatSelect } from "@/components/platform/FlatSelect";

// Même mécanique que app/platform/scans/RestaurantFilter.tsx : la page est un
// Server Component, tout ce qu'elle affiche (chiffres d'en-tête compris)
// dépend des paramètres d'URL — le menu navigue, il ne pilote aucun état
// client. `demo` est reconduit tel quel pour ne pas perdre l'onglet de
// périmètre en changeant d'établissement.
export function MembersFilter({
  restaurants,
  value,
  demo,
}: {
  restaurants: { id: string; name: string }[];
  value: string;
  demo: boolean;
}) {
  const router = useRouter();

  function go(restaurant: string) {
    const params = new URLSearchParams();
    if (restaurant) params.set("restaurant", restaurant);
    if (demo) params.set("demo", "1");
    const qs = params.toString();
    router.push(qs ? `/platform/members?${qs}` : "/platform/members");
  }

  return (
    <FlatSelect
      value={value}
      onChange={go}
      options={[
        { value: "", label: "Tous les établissements" },
        ...restaurants.map((r) => ({ value: r.id, label: r.name })),
      ]}
      searchable
      minSearchChars={3}
      searchPlaceholder="Chercher un établissement…"
      ariaLabel="Filtrer par établissement"
      menuWidth={320}
      triggerClassName="h-9 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors sm:w-72"
    />
  );
}
