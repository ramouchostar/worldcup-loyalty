import Link from "next/link";
import { ChevronLeft, Hourglass } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { loadBlocked } from "@/lib/missions-dates";
import { todayInBrussels } from "@/lib/qr-funnel";
import { buildProviderCalendar } from "@/lib/mission-dates";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { Availability } from "./Availability";

export const dynamic = "force-dynamic";

// ADR 0084 §5 — le calendrier du prestataire : il bloque les jours où il n'est pas libre.
export default async function AvailabilityPage() {
  const { provider } = await requireProviderPage();
  const today = todayInBrussels();
  const loaded = await loadBlocked(provider.id, today);

  return (
    <div className="space-y-5">
      <Link href="/prestataire" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
        <ChevronLeft className="w-4 h-4" aria-hidden /> Mes missions
      </Link>
      <PageHeader title="Mes disponibilités" subtitle="Touche les jours où tu n'es PAS libre. Les restaurateurs ne voient que tes jours libres, au moins 7 jours à l'avance." />
      {loaded.ok ? (
        <Availability days={buildProviderCalendar(today, loaded.blocked)} />
      ) : (
        <EmptyState icon={Hourglass} title="Le calendrier n'est pas encore disponible">
          Rien ne cloche chez toi : on finit de le mettre en place. Reviens bientôt.
        </EmptyState>
      )}
    </div>
  );
}
