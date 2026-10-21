import Link from "next/link";
import { ChevronLeft, Hourglass, Wallet } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { loadRevenueMissions } from "@/lib/provider-revenue-data";
import { BUCKET_LABEL, PAYOUT_NOTE, revenueRows, revenueTotals } from "@/lib/provider-revenue";
import { formatEuros } from "@/lib/mission-money";
import { METIER_LABELS } from "@/lib/mission-view";
import type { Metier } from "@/lib/mission-money";
import { Card, CardRow, EmptyState, PageHeader, SectionLabel, StatTile, StatusBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

// ADR 0084 §2 — « Mes revenus » : ce qui est à venir, retenu, à verser et déjà versé. Montants figés sur la mission (jamais recalculés
// ici). Pendant le pilote, Boosteats verse à la main : « à verser » dit exactement cela.
export default async function ProviderRevenue() {
  const { provider } = await requireProviderPage();
  const loaded = await loadRevenueMissions(provider.id);

  const back = (
    <Link href="/prestataire" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
      <ChevronLeft className="w-4 h-4" aria-hidden /> Mes missions
    </Link>
  );

  if (!loaded.ok) {
    return (
      <div className="space-y-5">
        {back}
        <EmptyState icon={Hourglass} title="Tes revenus ne sont pas encore disponibles">
          Rien ne cloche chez toi : on finit de mettre l&apos;écran en place. Reviens bientôt.
        </EmptyState>
      </div>
    );
  }

  const totals = revenueTotals(loaded.missions, new Date());
  const rows = revenueRows(loaded.missions);

  return (
    <div className="space-y-6">
      {back}
      <PageHeader title="Mes revenus" subtitle={PAYOUT_NOTE} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile value={formatEuros(totals.toPayCents)} label="À verser" hint="Livraison validée, virement à venir" />
        <StatTile value={formatEuros(totals.paidThisMonthCents)} label="Versé ce mois-ci" hint={`${formatEuros(totals.paidTotalCents)} au total`} />
        <StatTile value={formatEuros(totals.upcomingCents)} label="À venir" hint="Missions en cours" />
        <StatTile value={formatEuros(totals.onHoldCents + totals.cancelDueCents)} label="En attente d'une décision" hint="Médiation ou annulation à régler" />
      </div>

      <section className="space-y-3">
        <SectionLabel>Détail par mission</SectionLabel>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="Aucun revenu pour l'instant">
            Dès qu&apos;un devis est accepté, la mission apparaît ici avec ce que tu recevras.
          </EmptyState>
        ) : (
          <Card padding="p-0">
            {rows.map((m, i) => {
              const view = BUCKET_LABEL[m.bucket];
              return (
                <CardRow key={m.id} first={i === 0}>
                  <Link href={`/prestataire/mission/${m.id}`} className="flex items-center gap-3 min-h-[44px]">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-ink truncate">{m.restaurantName}</p>
                      <p className="text-[12.5px] text-ink-muted">
                        {METIER_LABELS[m.metier as Metier] ?? m.metier}
                        {m.quoteCents != null && m.bucket !== "cancel_due" && m.bucket !== "cancel_paid" ? ` · prix du devis ${formatEuros(m.quoteCents)}` : ""}
                      </p>
                      <div className="mt-1">
                        <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[15px] font-bold tabular-nums text-ink">{formatEuros(m.amountCents)}</p>
                      <p className="text-[11.5px] text-ink-muted">tu reçois</p>
                    </div>
                  </Link>
                </CardRow>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
