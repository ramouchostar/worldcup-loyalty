"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionLabel } from "@/components/admin/ui";
import { formatEuros } from "@/lib/mission-money";
import { quoteVsBudget } from "@/lib/mission-quote";

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
      setError(body.error ?? "Impossible pour le moment. Réessaie.");
    } catch {
      setError("Pas de connexion. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>Le devis de {providerName ?? "ton vidéaste"}</SectionLabel>
        <p className="font-display text-[28px] font-bold tracking-[-0.02em] text-ink mt-2">{formatEuros(view.paidCents)}</p>
        <p className="text-[13px] text-ink-muted">hors TVA · prix ferme pour ton brief</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
        <div>
          <dt className="text-ink-faint text-[12px]">Acompte pour réserver ({view.depositPct} %)</dt>
          <dd className="text-ink font-semibold">{formatEuros(view.depositCents)}</dd>
        </div>
        <div>
          <dt className="text-ink-faint text-[12px]">Solde, avant le tournage</dt>
          <dd className="text-ink font-semibold">{formatEuros(view.balanceCents)}</dd>
        </div>
        {quote.hours ? (
          <div>
            <dt className="text-ink-faint text-[12px]">Temps de travail</dt>
            <dd className="text-ink font-semibold">{String(quote.hours).replace(".", ",")} h</dd>
          </div>
        ) : null}
        {quote.deliveryDays ? (
          <div>
            <dt className="text-ink-faint text-[12px]">Livraison</dt>
            <dd className="text-ink font-semibold">{quote.deliveryDays} jours après le tournage</dd>
          </div>
        ) : null}
      </dl>

      {quote.included.length > 0 && (
        <p className="text-[13.5px] text-ink">
          <span className="font-semibold">Inclus :</span> {quote.included.join(", ")}
        </p>
      )}
      {quote.excluded.length > 0 && (
        <p className="text-[13.5px] text-ink-muted">
          <span className="font-semibold">Non inclus :</span> {quote.excluded.join(", ")}
        </p>
      )}
      {quote.hypotheses && (
        <p className="text-[13.5px] text-ink-muted whitespace-pre-line">
          <span className="font-semibold">Hypothèses du prestataire :</span> {quote.hypotheses}
        </p>
      )}
      {vsBudget && !vsBudget.within && (
        <p className="text-[13px] text-warn font-semibold">Ce devis dépasse de {vsBudget.overPct} % le budget que tu avais indiqué ({formatEuros(budgetCents ?? 0)}).</p>
      )}

      <div className="rounded-xl bg-boost-cream border border-boost-olive/30 p-3 text-[13.5px] text-ink-body space-y-1">
        <p className="font-semibold text-ink">Le paiement de l&apos;acompte arrive bientôt</p>
        <p>Dès que ce sera ouvert, tu pourras accepter ce devis, payer l&apos;acompte, et choisir la date du tournage dans les disponibilités de {providerName ?? "ton vidéaste"}. On te prévient.</p>
      </div>

      {canDecline && !confirm && (
        <button type="button" onClick={() => setConfirm(true)} className="text-[13.5px] font-semibold text-ink underline underline-offset-2 min-h-[44px]">
          Décliner ce devis
        </button>
      )}
      {canDecline && confirm && (
        <div className="rounded-xl border border-paper-border bg-white p-3 space-y-3">
          <p className="text-[13.5px] text-ink">Tu déclines ce devis : la mission est annulée, sans frais. Tu pourras faire un nouveau brief.</p>
          {error && (
            <p role="alert" className="text-danger text-[13px] font-semibold">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirm(false)} className="min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
              Garder le devis
            </button>
            <button type="button" disabled={busy} onClick={decline} className="flex-1 min-h-[44px] px-4 rounded-lg bg-ink text-white text-[14px] font-semibold disabled:opacity-60">
              {busy ? "…" : "Décliner"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
