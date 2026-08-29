"use client";

import { useRouter } from "next/navigation";
import { FlatSelect } from "@/components/platform/FlatSelect";

// Remplace la rangée de pastilles (une par établissement, illisible dès que
// le réseau compte des dizaines de comptes démo — "Fond réseau — Burger
// Anderlecht 37" etc.) par un menu cherchable. La sélection navigue
// (?restaurant=…) exactement comme le faisaient les <Link> avant : cette
// page est un Server Component, tout son contenu (entonnoir, tableau de
// scans) dépend de ce paramètre d'URL, pas d'un état client.
export function RestaurantFilter({
  restaurants,
  value,
}: {
  restaurants: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();

  return (
    <FlatSelect
      value={value}
      onChange={(v) => router.push(v ? `/platform/scans?restaurant=${v}` : "/platform/scans")}
      options={[{ value: "", label: "Tous les établissements" }, ...restaurants.map((r) => ({ value: r.id, label: r.name }))]}
      searchable
      minSearchChars={3}
      searchPlaceholder="Chercher un établissement…"
      ariaLabel="Filtrer par établissement"
      menuWidth={320}
      triggerClassName="h-10 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors sm:w-80"
    />
  );
}
