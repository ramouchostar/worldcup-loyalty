"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { FilterTabs } from "@/components/admin/ui";
import { STATS_PERIODS, type StatsPeriodKey } from "@/lib/stats-page";

// Ce mois · Mois dernier · Depuis le début — la période vit dans l'adresse
// (?periode=…) : un lien partagé ou un retour arrière retombe sur la même vue.
export function StatsPeriodTabs({ value }: { value: StatsPeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <div aria-busy={pending} className={pending ? "opacity-70" : ""}>
      <FilterTabs
        tabs={STATS_PERIODS}
        value={value}
        onChange={(key) =>
          startTransition(() => router.replace(key === "mois" ? pathname : `${pathname}?periode=${key}`, { scroll: false }))
        }
      />
    </div>
  );
}
