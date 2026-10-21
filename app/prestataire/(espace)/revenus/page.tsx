import Link from "next/link";
import { ChevronLeft, Hourglass, Wallet } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { loadRevenueMissions } from "@/lib/provider-revenue-data";
import { BUCKET_TONE, revenueRows, revenueTotals } from "@/lib/provider-revenue";
import { getProviderLocale } from "@/lib/provider-locale";
import { formatEurosL, getT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import { Card, CardRow, EmptyState, PageHeader, SectionLabel, StatTile, StatusBadge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

// ADR 0084 §2 — « Mes revenus » : ce qui est à venir, retenu, à verser et déjà versé. Montants figés sur la mission (jamais recalculés
// ici). Pendant le pilote, Boosteats verse à la main : « à verser » dit exactement cela.
export default async function ProviderRevenue() {
  const { provider } = await requireProviderPage();
  const locale = await getProviderLocale(provider.id);
  const { t } = getT(locale);
  const eur = (cents: number) => formatEurosL(cents, locale);
  const loaded = await loadRevenueMissions(provider.id);

  const back = (
    <Link href="/prestataire" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
      <ChevronLeft className="w-4 h-4" aria-hidden /> {t("revenue.back")}
    </Link>
  );

  if (!loaded.ok) {
    return (
      <div className="space-y-5">
        {back}
        <EmptyState icon={Hourglass} title={t("revenue.unavailable.title")}>
          {t("revenue.unavailable.body")}
        </EmptyState>
      </div>
    );
  }

  const totals = revenueTotals(loaded.missions, new Date());
  const rows = revenueRows(loaded.missions);

  return (
    <div className="space-y-6">
      {back}
      <PageHeader title={t("revenue.title")} subtitle={t("revenue.note")} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile value={eur(totals.toPayCents)} label={t("revenue.tile.toPay")} hint={t("revenue.tile.toPay.hint")} />
        <StatTile value={eur(totals.paidThisMonthCents)} label={t("revenue.tile.paidMonth")} hint={t("revenue.tile.paidMonth.hint", { total: eur(totals.paidTotalCents) })} />
        <StatTile value={eur(totals.upcomingCents)} label={t("revenue.tile.upcoming")} hint={t("revenue.tile.upcoming.hint")} />
        <StatTile value={eur(totals.onHoldCents + totals.cancelDueCents)} label={t("revenue.tile.hold")} hint={t("revenue.tile.hold.hint")} />
      </div>

      <section className="space-y-3">
        <SectionLabel>{t("revenue.detail")}</SectionLabel>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title={t("revenue.empty.title")}>
            {t("revenue.empty.body")}
          </EmptyState>
        ) : (
          <Card padding="p-0">
            {rows.map((m, i) => (
              <CardRow key={m.id} first={i === 0}>
                <Link href={`/prestataire/mission/${m.id}`} className="flex items-center gap-3 min-h-[44px]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-ink truncate">{m.restaurantName}</p>
                    <p className="text-[12.5px] text-ink-muted">
                      {t(`metier.${m.metier}` as MessageKey)}
                      {m.quoteCents != null && m.bucket !== "cancel_due" && m.bucket !== "cancel_paid" ? ` · ${t("revenue.row.quote", { price: eur(m.quoteCents) })}` : ""}
                    </p>
                    <div className="mt-1">
                      <StatusBadge tone={BUCKET_TONE[m.bucket]}>{t(`revenue.bucket.${m.bucket}` as MessageKey)}</StatusBadge>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-bold tabular-nums text-ink">{eur(m.amountCents)}</p>
                    <p className="text-[11.5px] text-ink-muted">{t("revenue.row.youReceive")}</p>
                  </div>
                </Link>
              </CardRow>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
