"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionLabel } from "@/components/admin/ui";
import { quoteVsBudget } from "@/lib/mission-quote";
import { useT } from "@/components/i18n/I18nProvider";
import { formatEurosL } from "@/lib/i18n/core";

// ADR 0084 — le devis reçu, vu du restaurateur : ce qu'il paierait selon SON plan, l'acompte, le solde,
// ce qui est inclus ET ce qui ne l'est pas, les hypothèses. Il peut le décliner (rien n'est payé).
// L'acceptation avec paiement de l'acompte arrive avec Stripe : le bouton le dit, il ne fait pas semblant.
export function QuoteCard({
  restaurantId,
  missionId,
  providerName,
  quote,
  view,
  budgetCents,
  canDecline,
}: {
  restaurantId: string;
  missionId: string;
  providerName: string | null;
  quote: { hours: number | null; deliveryDays: number | null; included: string[]; excluded: string[]; hypotheses: string | null };
  view: { paidCents: number; depositCents: number; balanceCents: number; depositPct: number };
  budgetCents: number | null;
  canDecline: boolean;
}) {
  const router = useRouter();
  const tr = useT();
  const { t, locale } = tr;
  const eur = (cents: number) => formatEurosL(cents, locale);
  const name = providerName ?? t("rest.yourProvider");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vsBudget = quoteVsBudget(view.paidCents, budgetCents);

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/missions/${missionId}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(tr.err(body, "err.generic"));
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>{t("rest.quote.title", { name })}</SectionLabel>
        <p className="font-display text-[28px] font-bold tracking-[-0.02em] text-ink mt-2">{eur(view.paidCents)}</p>
        <p className="text-[13px] text-ink-muted">{t("rest.quote.sub")}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
        <div>
          <dt className="text-ink-faint text-[12px]">{t("rest.quote.deposit", { pct: view.depositPct })}</dt>
          <dd className="text-ink font-semibold">{eur(view.depositCents)}</dd>
        </div>
        <div>
          <dt className="text-ink-faint text-[12px]">{t("rest.quote.balance")}</dt>
          <dd className="text-ink font-semibold">{eur(view.balanceCents)}</dd>
        </div>
        {quote.hours ? (
          <div>
            <dt className="text-ink-faint text-[12px]">{t("rest.quote.hours")}</dt>
            <dd className="text-ink font-semibold">{String(quote.hours).replace(".", locale === "en" ? "." : ",")} h</dd>
          </div>
        ) : null}
        {quote.deliveryDays ? (
          <div>
            <dt className="text-ink-faint text-[12px]">{t("rest.quote.delivery")}</dt>
            <dd className="text-ink font-semibold">{t("rest.quote.deliveryDays", { days: quote.deliveryDays })}</dd>
          </div>
        ) : null}
      </dl>

      {quote.included.length > 0 && (
        <p className="text-[13.5px] text-ink">
          <span className="font-semibold">{t("rest.quote.included")}</span> {quote.included.map((x) => tr.canon("included", x)).join(", ")}
        </p>
      )}
      {quote.excluded.length > 0 && (
        <p className="text-[13.5px] text-ink-muted">
          <span className="font-semibold">{t("rest.quote.excluded")}</span> {quote.excluded.map((x) => tr.canon("included", x)).join(", ")}
        </p>
      )}
      {quote.hypotheses && (
        <p className="text-[13.5px] text-ink-muted whitespace-pre-line">
          <span className="font-semibold">{t("rest.quote.hypotheses")}</span> {quote.hypotheses}
        </p>
      )}
      {vsBudget && !vsBudget.within && (
        <p className="text-[13px] text-warn font-semibold">{t("rest.quote.over", { pct: vsBudget.overPct, budget: eur(budgetCents ?? 0) })}</p>
      )}

      <div className="rounded-xl bg-boost-cream border border-boost-olive/30 p-3 text-[13.5px] text-ink-body space-y-1">
        <p className="font-semibold text-ink">{t("rest.quote.ok.title")}</p>
        <p>{t("rest.quote.ok.body", { pct: view.depositPct, deposit: eur(view.depositCents), name })}</p>
      </div>

      {canDecline && !confirm && (
        <button type="button" onClick={() => setConfirm(true)} className="text-[13.5px] font-semibold text-ink underline underline-offset-2 min-h-[44px]">
          {t("rest.quote.decline")}
        </button>
      )}
      {canDecline && confirm && (
        <div className="rounded-xl border border-paper-border bg-white p-3 space-y-3">
          <p className="text-[13.5px] text-ink">{t("rest.quote.decline.body")}</p>
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirm(false)} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
              {t("rest.quote.keep")}
            </button>
            <button type="button" disabled={busy} onClick={decline} className="flex-1 min-h-[44px] px-4 rounded-lg bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
              {busy ? "…" : t("rest.quote.declineDo")}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
