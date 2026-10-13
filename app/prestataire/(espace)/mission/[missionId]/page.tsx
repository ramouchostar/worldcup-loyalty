import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { getForProvider } from "@/lib/provider-missions";
import { briefRows, METIER_LABELS, PROVIDER_STATUS_VIEW } from "@/lib/mission-view";
import { formatEuros } from "@/lib/mission-money";
import { providerView } from "@/lib/mission-quote";
import { Card, EmptyState, PageHeader, SectionLabel, StatusBadge } from "@/components/admin/ui";
import { dateLabelFr } from "@/lib/mission-team-message";
import { judgeConfirm } from "@/lib/mission-reminders";
import { todayInBrussels } from "@/lib/qr-funnel";
import { PresenceCard } from "@/components/missions/PresenceCard";
import { judgeStart } from "@/lib/mission-dayof";
import { listDeliveries, listRetouches } from "@/lib/missions-dayof";
import { versionLabel } from "@/lib/mission-retouch";
import { DeliveryForm, ReportForm, StartButton } from "./DayOfPanel";
import { CancelCard } from "@/components/missions/CancelCard";
import { costNow } from "@/lib/missions-cancel";
import { PROVIDER_REASONS, canCancel, describeCost } from "@/lib/mission-cancel-rules";
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

      {mission.shoot_date && mission.shoot_start && mission.status !== "annule" && (
        <Card className="space-y-2">
          <SectionLabel>Le tournage</SectionLabel>
          <p className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">
            {dateLabelFr(mission.shoot_date)} à {mission.shoot_start}
          </p>
          {(() => {
            const c = (mission.brief?.contact as { name?: string; phone?: string } | undefined) ?? {};
            const roles = Array.isArray(mission.brief?.roles) ? (mission.brief.roles as string[]) : [];
            return (
              <>
                <p className="text-[13.5px] text-ink">
                  <span className="font-semibold">Contact sur place :</span> {[c.name, c.phone].filter(Boolean).join(" · ") || "à confirmer"}
                </p>
                {roles.length > 0 && (
                  <p className="text-[13.5px] text-ink">
                    <span className="font-semibold">Présents :</span> {roles.join(", ").toLowerCase()}
                  </p>
                )}
                {typeof mission.brief?.access === "string" && mission.brief.access && (
                  <p className="text-[13.5px] text-ink whitespace-pre-line">
                    <span className="font-semibold">Accès :</span> {mission.brief.access}
                  </p>
                )}
              </>
            );
          })()}
          <p className="text-[12.5px] text-ink-muted">Le restaurateur est engagé sur cette date, et toi aussi.</p>
        </Card>
      )}

      {mission.status === "date_bloquee" && mission.shoot_date && (
        <PresenceCard
          confirmUrl={`/api/prestataire/missions/${mission.id}/confirm`}
          body={{}}
          icsUrl={`/api/prestataire/missions/${mission.id}/ics`}
          verdict={judgeConfirm(mission.shoot_date, todayInBrussels())}
          selfConfirmed={!!mission.j2_confirmed_provider_at}
          otherConfirmed={!!mission.j2_confirmed_restaurant_at}
          otherName={mission.restaurant_name}
        />
      )}

      {mission.status === "date_bloquee" && mission.shoot_date && (
        <StartButton missionId={mission.id} canStart={judgeStart(mission.status, mission.shoot_date, todayInBrussels()) === "ok"} tooEarly={judgeStart(mission.status, mission.shoot_date, todayInBrussels()) === "too_early"} />
      )}

      {mission.status === "production" && (
        <>
          {mission.report_confirmed_at && <p className="text-[13.5px] text-good font-semibold">Le restaurateur a confirmé ton compte-rendu.</p>}
          {mission.report_contested_at && <p className="text-[13.5px] text-warn font-semibold">Le restaurateur conteste ton compte-rendu : Boosteats te contacte. Tu peux quand même livrer.</p>}
          {!mission.report_confirmed_at && !mission.report_contested_at && (
            <ReportForm
              missionId={mission.id}
              defaultArrival={mission.shoot_start ?? ""}
              initial={mission.report ? { arrival: String(mission.report.arrival ?? ""), end: String(mission.report.end ?? ""), missing: Array.isArray(mission.report.missing) ? (mission.report.missing as string[]) : [], note: String(mission.report.note ?? "") } : null}
            />
          )}
          {mission.report_submitted_at ? <DeliveryForm missionId={mission.id} /> : <p className="text-[13.5px] text-ink-muted">La livraison s&apos;ouvre une fois le compte-rendu envoyé.</p>}
        </>
      )}

      {mission.status === "retouche" &&
        (await listRetouches(mission.id)).slice(-1).map((r) => (
          <Card key={r.round} className="space-y-3">
            <SectionLabel>Retouche demandée · tour {r.round} sur 2</SectionLabel>
            <p className="text-[13px] text-ink-muted">Toutes les remarques du restaurateur, d&apos;un seul envoi. Une retouche n&apos;est pas une refonte : si une demande change le brief de départ, c&apos;est une demande de modification que tu peux chiffrer ou refuser.</p>
            <ol className="space-y-2">
              {r.notes.map((n, i) => (
                <li key={i} className="rounded-xl border border-paper-border bg-white p-3">
                  <p className="text-[12px] font-semibold text-ink-muted">
                    {n.category}
                    {n.at ? ` · ${n.at}` : ""}
                  </p>
                  <p className="text-[14px] text-ink whitespace-pre-line">{n.text}</p>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      {mission.status === "retouche" && <DeliveryForm missionId={mission.id} title={`Livrer la ${versionLabel(mission.retouch_rounds_used + 1).toLowerCase()}`} />}

      {(mission.status === "livre" || mission.status === "valide" || mission.status === "verse") &&
        (await listDeliveries(mission.id)).map((d) => (
          <Card key={d.id} className="space-y-2">
            <SectionLabel>{d.round > 1 ? `Ta ${versionLabel(d.round).toLowerCase()}` : "Ta livraison"}</SectionLabel>
            <ul className="text-[13.5px] text-ink space-y-1">
              {d.links.map((l) => (
                <li key={l} className="truncate">{l}</li>
              ))}
            </ul>
            <p className="text-[13.5px] text-ink-muted">
              {mission.status === "livre" ? "En attente de la validation du restaurateur." : "Livraison validée par le restaurateur."}
            </p>
          </Card>
        ))}

      {mission.status === "annule" && !quote && <p className="text-[13.5px] text-ink-muted">Cette mission est annulée.</p>}
      {canCancel("provider", mission.status) &&
        (() => {
          const q = costNow(mission, "provider");
          return (
            <CancelCard
              cancelUrl={`/api/prestataire/missions/${mission.id}/cancel`}
              body={{}}
              reasons={PROVIDER_REASONS}
              costText={describeCost("provider", q, () => "")}
              severity={q.band}
              title="Je ne peux plus venir"
              extraWarning="Le restaurateur compte sur cette date : il est remboursé en entier, et le jour redevient libre dans ton calendrier."
              confirmLabel="Annuler le tournage"
            />
          );
        })()}
    </div>
  );
}
