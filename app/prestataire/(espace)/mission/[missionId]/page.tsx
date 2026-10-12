import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { getForProvider } from "@/lib/provider-missions";
import { briefRows, METIER_LABELS, PROVIDER_STATUS_VIEW } from "@/lib/mission-view";
import { formatEuros } from "@/lib/mission-money";
import { providerView } from "@/lib/mission-quote";
import { Card, EmptyState, PageHeader, SectionLabel, StatusBadge } from "@/components/admin/ui";
import { QuoteForm } from "./QuoteForm";
import { RefuseForm } from "./RefuseForm";

export const dynamic = "force-dynamic";

// ADR 0084 — un brief reçu : le brief complet et verrouillé, puis ce que le prestataire peut faire
// (chiffrer ou refuser avec une raison) ; une fois le devis parti, il le relit et attend.
export default async function ProviderMissionPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const { provider } = await requireProviderPage();
  const found = await getForProvider(missionId, provider.id);

  const back = (
    <Link href="/prestataire" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
      <ChevronLeft className="w-4 h-4" aria-hidden /> Mes missions
    </Link>
  );

  if (!found.ok) {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState icon={Hourglass} title="Le service n'est pas encore ouvert">
          Reviens bientôt : on finit de le mettre en place.
        </EmptyState>
      </div>
    );
  }
  const { mission, template, quote } = found;
  if (!mission || !template) notFound();

  const view = PROVIDER_STATUS_VIEW[mission.status];
  const rows = briefRows(mission.brief ?? {}, template);
  const budget = typeof mission.brief?.budget_cents === "number" ? mission.brief.budget_cents : null;
  const received = new Date(mission.brief_locked_at ?? mission.created_at).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" });

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={mission.restaurant_name}
        subtitle={`${METIER_LABELS[mission.metier]}${typeof mission.brief?.goal === "string" ? ` · ${mission.brief.goal}` : ""} · reçu le ${received}`}
        action={<StatusBadge tone={view.tone}>{view.label}</StatusBadge>}
      />

      <Card padding="p-0">
        <div className="px-5 pt-4">
          <SectionLabel>Le brief</SectionLabel>
          <p className="text-ink-muted text-[13px] mt-1">Complet et verrouillé : tu peux chiffrer. Un changement ensuite est une demande de modification.</p>
        </div>
        <dl className="mt-2">
          {rows.map((r, i) => (
            <div key={r.label} className={`px-5 py-3 ${i === 0 ? "" : "border-t border-paper-border"}`}>
              <dt className="text-[12px] text-ink-faint">{r.label}</dt>
              <dd className="text-[14px] text-ink whitespace-pre-line">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {mission.status === "envoye" && (
        <>
          <QuoteForm missionId={mission.id} metier={mission.metier} budgetCents={budget} />
          <RefuseForm missionId={mission.id} />
        </>
      )}

      {quote && (
        <Card className="space-y-3">
          <SectionLabel>Ton devis</SectionLabel>
          <p className="text-[14px] text-ink">
            <span className="font-bold">{formatEuros(quote.price_cents)}</span> · tu reçois <span className="font-bold">{formatEuros(providerView(quote.price_cents).youReceiveCents)}</span>
          </p>
          <p className="text-[13.5px] text-ink-muted">
            {quote.hours ? `${String(quote.hours).replace(".", ",")} h de travail` : ""}
            {quote.hours && quote.delivery_days ? " · " : ""}
            {quote.delivery_days ? `livraison en ${quote.delivery_days} jours` : ""}
          </p>
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
          {quote.hypotheses && <p className="text-[13.5px] text-ink-muted whitespace-pre-line">{quote.hypotheses}</p>}
          {mission.status === "devis" && (
            <p className="text-[13.5px] text-ink-muted border-t border-paper-border pt-3">En attente de la réponse du restaurateur. Ton devis est ferme pour ce brief.</p>
          )}
        </Card>
      )}

      {mission.status === "annule" && !quote && <p className="text-[13.5px] text-ink-muted">Cette mission est annulée.</p>}
    </div>
  );
}
