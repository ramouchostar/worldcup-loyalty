import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { getForProvider } from "@/lib/provider-missions";
import { briefRows, PROVIDER_STATUS_VIEW } from "@/lib/mission-view";
import { getProviderLocale } from "@/lib/provider-locale";
import { LOCALE_TAG, dayLabel, formatEurosL, getT, type MessageKey } from "@/lib/i18n";
import { providerView } from "@/lib/mission-quote";
import { Card, EmptyState, PageHeader, SectionLabel, StatusBadge } from "@/components/admin/ui";
import { judgeConfirm } from "@/lib/mission-reminders";
import { todayInBrussels } from "@/lib/qr-funnel";
import { PresenceCard } from "@/components/missions/PresenceCard";
import { judgeStart } from "@/lib/mission-dayof";
import { listDeliveries, listRetouches } from "@/lib/missions-dayof";
import { DeliveryForm, ReportForm, StartButton, StartWorkButton } from "./DayOfPanel";
import { hasShoot } from "@/lib/mission-metier";
import { rulesKindOf, rulesVersionFor } from "@/lib/mission-rules";
import { briefHeadline } from "@/lib/mission-view";
import { CancelCard } from "@/components/missions/CancelCard";
import { costNow } from "@/lib/missions-cancel";
import { PROVIDER_REASONS, canCancel, describeCostT } from "@/lib/mission-cancel-rules";
import { getTerms } from "@/lib/marketplace-settings";
import { QuoteForm } from "./QuoteForm";
import { RefuseForm } from "./RefuseForm";
import { ProposalsForm } from "./ProposalsForm";
import { RulesGate } from "./RulesGate";
import { providerHasAccepted } from "@/lib/missions-rules";
import { listFiles } from "@/lib/missions-files";
import { AttachmentList } from "@/components/missions/AttachmentList";
import { MessagesCard } from "@/components/missions/MessagesCard";
import { ReviewCard } from "@/components/missions/ReviewCard";
import { reviewedDirections } from "@/lib/missions-reviews";
import { canReview } from "@/lib/mission-reviews";
import { listMessages, unreadCounts } from "@/lib/missions-messages";
import { canWrite as canWriteMessage, contactsUnlocked } from "@/lib/mission-messages";
import { BatPanel } from "./BatPanel";
import { listProofs } from "@/lib/missions-bat-state";
import { batPhase } from "@/lib/mission-print";
import { ChangePanel } from "./ChangePanel";
import { listChanges } from "@/lib/missions-changes-state";
import { loadProposalState, proposalView, rulesState } from "@/lib/missions-proposals-state";
import { judgeSubmit } from "@/lib/mission-proposals";

export const dynamic = "force-dynamic";

// ADR 0084 — un brief reçu : le brief complet et verrouillé, puis ce que le prestataire peut faire
// (chiffrer ou refuser avec une raison) ; une fois le devis parti, il le relit et attend.
export default async function ProviderMissionPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const { provider } = await requireProviderPage();
  const locale = await getProviderLocale(provider.id);
  const tr = getT(locale);
  const { t } = tr;
  const eur = (cents: number) => formatEurosL(cents, locale);
  const found = await getForProvider(missionId, provider.id);

  const back = (
    <Link href="/prestataire" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
      <ChevronLeft className="w-4 h-4" aria-hidden /> {t("mission.back")}
    </Link>
  );

  if (!found.ok) {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState icon={Hourglass} title={t("mission.notOpen.title")}>
          {t("mission.notOpen.body")}
        </EmptyState>
      </div>
    );
  }
  const { mission, template, quote } = found;
  if (!mission || !template) notFound();

  const view = PROVIDER_STATUS_VIEW[mission.status];
  const rows = briefRows(mission.brief ?? {}, template);
  const budget = typeof mission.brief?.budget_cents === "number" ? mission.brief.budget_cents : null;
  // Les idées de tournage (PR K) : migration absente → rien d'affiché, le reste de la mission fonctionne.
  const files = await listFiles(mission.id);
  const filesBase = `/api/prestataire/missions/${mission.id}/files`;
  // Les règles du jeu : à accepter une fois par version avant le premier devis (migration absente : pas de blocage).
  const rules = mission.status === "envoye" ? await providerHasAccepted(provider.id, rulesVersionFor(rulesKindOf(mission.metier))) : null;
  const rulesPending = !!rules && rules.ok && !rules.accepted;
  // Les demandes de modification (PR M) : migration absente → rien d'affiché, le reste de la mission fonctionne.
  const changesRes = mission.status === "envoye" || mission.status === "devis" ? null : await listChanges(mission.id);
  const commissionBps = changesRes?.ok && changesRes.changes.some((c) => c.status === "proposed") ? (await getTerms()).terms.commissionBps : 0;
  const reviewed = canReview(mission.status) ? await reviewedDirections(mission.id) : null;
  const proofsRes = mission.metier === "impression" && mission.status === "production" ? await listProofs(mission.id) : null;
  const thread = await listMessages(mission.id, "provider");
  const unread = (await unreadCounts([mission.id], "provider")).get(mission.id) ?? 0;
  const changeFiles = (seq: number) => files.filter((f) => f.scope === "change" && f.ref === `change-${seq}`);
  const pstate = mission.shoot_date && mission.status !== "annule" ? await loadProposalState(mission.id) : null;
  const pview = pstate?.ok ? proposalView(mission, pstate.state) : null;
  const received = new Date(mission.brief_locked_at ?? mission.created_at).toLocaleDateString(LOCALE_TAG[locale], { day: "numeric", month: "long", timeZone: "Europe/Brussels" });

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={mission.restaurant_name}
        subtitle={t("mission.subtitle", { metier: t(`metier.${mission.metier}` as MessageKey), headline: briefHeadline(mission.brief) ? ` · ${briefHeadline(mission.brief)}` : "", date: received })}
        action={<StatusBadge tone={view.tone}>{t(`status.provider.${mission.status}` as MessageKey)}</StatusBadge>}
      />

      <Card padding="p-0">
        <div className="px-5 pt-4">
          <SectionLabel>{t("mission.brief.title")}</SectionLabel>
          <p className="text-ink-muted text-[13px] mt-1">{t("mission.brief.note")}</p>
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

      {files.some((f) => f.scope === "brief") && (
        <Card className="space-y-2">
          <SectionLabel>{t("mission.brief.files")}</SectionLabel>
          <AttachmentList locale={locale} files={files.filter((f) => f.scope === "brief")} base={filesBase} />
        </Card>
      )}

      {changesRes?.ok &&
        changesRes.changes
          .filter((c) => c.status === "proposed")
          .map((c) => (
            <ChangePanel key={c.id} missionId={mission.id} commissionBps={commissionBps} filesBase={filesBase} change={{ id: c.id, seq: c.seq, categories: c.categories, description: c.description, files: changeFiles(c.seq) }} />
          ))}
      {changesRes?.ok && changesRes.changes.some((c) => c.status === "quoted") && (
        <Card className="space-y-1">
          <SectionLabel>{t("mission.change.quoted.title")}</SectionLabel>
          <p className="text-[13.5px] text-ink-muted">{t("mission.change.quoted.body")}</p>
        </Card>
      )}
      {changesRes?.ok && changesRes.changes.some((c) => c.status === "accepted") && (
        <Card className="space-y-3">
          <SectionLabel>{t("mission.change.accepted.title")}</SectionLabel>
          <p className="text-[13px] text-ink-muted">{t("mission.change.accepted.note")}</p>
          <ol className="space-y-3">
            {changesRes.changes
              .filter((c) => c.status === "accepted")
              .map((c) => (
                <li key={c.id} className="rounded-xl border border-paper-border bg-white p-3 space-y-1.5">
                  <p className="text-[12.5px] font-semibold text-ink-muted">
                    {t("mission.change.item", { seq: c.seq, categories: c.categories.join(" · ") })}
                  </p>
                  <p className="text-[14px] text-ink whitespace-pre-line">{c.description}</p>
                  <p className="text-[13px] text-ink">
                    {c.provider_cents ? t("mission.change.extra", { amount: eur(c.provider_cents) }) : t("mission.change.noExtra")}
                    {c.delta_days ? tr.tp("mission.change.delay", c.delta_days) : ""}
                  </p>
                  <AttachmentList locale={locale} files={changeFiles(c.seq)} base={filesBase} />
                </li>
              ))}
          </ol>
        </Card>
      )}

      <MessagesCard
        me="provider"
        otherName={mission.restaurant_name}
        messages={thread}
        sendUrl={`/api/prestataire/missions/${mission.id}/messages`}
        readUrl={`/api/prestataire/missions/${mission.id}/messages/read`}
        canWrite={canWriteMessage(mission.status)}
        contactsLocked={!contactsUnlocked(mission.status)}
        unread={unread}
      />

      {mission.status === "envoye" && (
        <>
          {rulesPending ? <RulesGate kind={rulesKindOf(mission.metier)} /> : <QuoteForm missionId={mission.id} metier={mission.metier} budgetCents={budget} commissionBps={(await getTerms()).terms.commissionBps} />}
          <RefuseForm missionId={mission.id} />
        </>
      )}

      {quote && (
        <Card className="space-y-3">
          <SectionLabel>{t("mission.quote.title")}</SectionLabel>
          <p className="text-[14px] text-ink font-bold">
            {t("mission.quote.youReceive", { price: eur(quote.price_cents), amount: eur(providerView(quote.price_cents, (await getTerms()).terms).youReceiveCents) })}
          </p>
          <p className="text-[13.5px] text-ink-muted">
            {quote.hours ? t("mission.quote.hours", { hours: String(quote.hours).replace(".", locale === "en" ? "." : ",") }) : ""}
            {quote.hours && quote.delivery_days ? " · " : ""}
            {quote.delivery_days ? t("mission.quote.delivery", { days: quote.delivery_days }) : ""}
          </p>
          {quote.included.length > 0 && (
            <p className="text-[13.5px] text-ink">
              <span className="font-semibold">{t("mission.quote.included")}</span> {quote.included.map((x) => tr.canon("included", x)).join(", ")}
            </p>
          )}
          {quote.excluded.length > 0 && (
            <p className="text-[13.5px] text-ink-muted">
              <span className="font-semibold">{t("mission.quote.excluded")}</span> {quote.excluded.map((x) => tr.canon("included", x)).join(", ")}
            </p>
          )}
          {quote.hypotheses && <p className="text-[13.5px] text-ink-muted whitespace-pre-line">{quote.hypotheses}</p>}
          {mission.status === "devis" && (
            <p className="text-[13.5px] text-ink-muted border-t border-paper-border pt-3">{t("mission.quote.waiting")}</p>
          )}
        </Card>
      )}

      {mission.shoot_date && mission.shoot_start && mission.status !== "annule" && (
        <Card className="space-y-2">
          <SectionLabel>{t("mission.shoot.title")}</SectionLabel>
          <p className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">
            {t("mission.shoot.when", { date: dayLabel(mission.shoot_date, locale), time: mission.shoot_start })}
          </p>
          {(() => {
            const c = (mission.brief?.contact as { name?: string; phone?: string } | undefined) ?? {};
            const roles = Array.isArray(mission.brief?.roles) ? (mission.brief.roles as string[]) : [];
            return (
              <>
                <p className="text-[13.5px] text-ink">
                  <span className="font-semibold">{t("mission.shoot.contact")}</span> {[c.name, c.phone].filter(Boolean).join(" · ") || t("mission.shoot.contactTbd")}
                </p>
                {roles.length > 0 && (
                  <p className="text-[13.5px] text-ink">
                    <span className="font-semibold">{t("mission.shoot.roles")}</span> {roles.join(", ").toLowerCase()}
                  </p>
                )}
                {typeof mission.brief?.access === "string" && mission.brief.access && (
                  <p className="text-[13.5px] text-ink whitespace-pre-line">
                    <span className="font-semibold">{t("mission.shoot.access")}</span> {mission.brief.access}
                  </p>
                )}
              </>
            );
          })()}
          <p className="text-[12.5px] text-ink-muted">{t("mission.shoot.committed")}</p>
        </Card>
      )}

      {pview && pstate?.ok && (pview.phase === "awaiting_proposals" || pview.phase === "awaiting_second") && pview.deadline &&
        (judgeSubmit(rulesState(mission, pstate.state), todayInBrussels()) === "ok" ? (
          <ProposalsForm
            missionId={mission.id}
            deadlineLabel={dayLabel(pview.deadline.day, locale)}
            second={pview.phase === "awaiting_second"}
            rejected={pview.phase === "awaiting_second" ? pview.first.filter((p) => p.rejection_reason).map((p) => ({ title: p.title, reason: p.rejection_reason! })) : []}
          />
        ) : (
          <Card className="space-y-1">
            <SectionLabel>{t("mission.ideas.title")}</SectionLabel>
            <p className="text-[13.5px] text-warn font-semibold">{t("mission.ideas.late")}</p>
          </Card>
        ))}
      {pview && (pview.phase === "choose" || pview.phase === "choose_second") && pview.deadline && (
        <Card className="space-y-3">
          <SectionLabel>{t("mission.ideas.yours")}</SectionLabel>
          <p className="text-[13.5px] text-ink-muted">{t("mission.ideas.chooseBefore", { date: dayLabel(pview.deadline.day, locale) })}</p>
          <ol className="space-y-2">
            {pview.current.map((p) => (
              <li key={p.id} className="rounded-xl border border-paper-border bg-white p-3">
                <p className="text-[14px] font-semibold text-ink">{p.title}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {pview?.chosen && pstate?.ok && pstate.state.chosenBy && (
        <Card className="space-y-2">
          <SectionLabel>{t("mission.ideas.chosen")}</SectionLabel>
          <p className="text-[12.5px] text-ink-muted">{t("mission.ideas.chosenLocked", { who: t(`mission.chosenBy.${pstate.state.chosenBy}` as MessageKey) })}</p>
          <p className="text-[15px] font-bold text-ink">{pview.chosen.title}</p>
          <p className="text-[13.5px] text-ink whitespace-pre-line">{pview.chosen.idea}</p>
          <p className="text-[13.5px] text-ink">
            <span className="font-semibold">{t("mission.ideas.onsite")}</span> {pview.chosen.onsite}
          </p>
          <AttachmentList locale={locale} files={files.filter((f) => f.scope === "proposal" && f.ref === pview.chosen!.id)} base={filesBase} />
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

      {mission.status === "accepte" && !hasShoot(mission.metier) && <StartWorkButton missionId={mission.id} />}

      {mission.status === "production" && mission.metier === "design" && <DeliveryForm missionId={mission.id} title={t("mission.deliver.work")} />}
      {mission.status === "production" && mission.metier === "impression" && !proofsRes?.ok && <p className="text-[13.5px] text-ink-muted">{t("mission.bat.unavailable")}</p>}
      {mission.status === "production" && mission.metier === "impression" && proofsRes?.ok && (
        <BatPanel
          missionId={mission.id}
          phase={batPhase(proofsRes.proofs)}
          proofs={proofsRes.proofs.map((p) => ({ id: p.id, round: p.round, status: p.status, corrections: p.corrections, signedName: p.signed_name }))}
          qrUrl={typeof mission.brief?.qr_url === "string" && mission.brief.qr_url.trim() ? mission.brief.qr_url.trim() : null}
        />
      )}

      {mission.status === "production" && hasShoot(mission.metier) && (
        <>
          {mission.report_confirmed_at && <p className="text-[13.5px] text-good font-semibold">{t("mission.report.confirmed")}</p>}
          {mission.report_contested_at && <p className="text-[13.5px] text-warn font-semibold">{t("mission.report.contested")}</p>}
          {!mission.report_confirmed_at && !mission.report_contested_at && (
            <ReportForm
              missionId={mission.id}
              defaultArrival={mission.shoot_start ?? ""}
              initial={mission.report ? { arrival: String(mission.report.arrival ?? ""), end: String(mission.report.end ?? ""), missing: Array.isArray(mission.report.missing) ? (mission.report.missing as string[]) : [], note: String(mission.report.note ?? "") } : null}
            />
          )}
          {mission.report_submitted_at ? <DeliveryForm missionId={mission.id} /> : <p className="text-[13.5px] text-ink-muted">{t("mission.report.deliveryLocked")}</p>}
        </>
      )}

      {mission.status === "retouche" &&
        (await listRetouches(mission.id)).slice(-1).map((r) => (
          <Card key={r.round} className="space-y-3">
            <SectionLabel>{t("mission.retouch.title", { round: r.round })}</SectionLabel>
            <p className="text-[13px] text-ink-muted">{t("mission.retouch.note")}</p>
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
            <AttachmentList locale={locale} files={files.filter((f) => f.scope === "retouch" && f.ref === `round-${r.round}`)} base={filesBase} />
          </Card>
        ))}
      {mission.status === "retouche" && <DeliveryForm missionId={mission.id} title={t("mission.deliver.version", { version: t("mission.version", { n: mission.retouch_rounds_used + 1 }) })} />}

      {(mission.status === "livre" || mission.status === "valide" || mission.status === "verse") &&
        (await listDeliveries(mission.id)).map((d) => (
          <Card key={d.id} className="space-y-2">
            <SectionLabel>{d.round > 1 ? t("mission.delivery.version", { version: t("mission.version", { n: d.round }) }) : t("mission.delivery.first")}</SectionLabel>
            <ul className="text-[13.5px] text-ink space-y-1">
              {d.links.map((l) => (
                <li key={l} className="truncate">{l}</li>
              ))}
            </ul>
            <p className="text-[13.5px] text-ink-muted">
              {mission.status === "livre" ? t("mission.delivery.waiting") : t("mission.delivery.validated")}
            </p>
          </Card>
        ))}

      {reviewed && !reviewed.provider_to_restaurant && <ReviewCard audience="provider" url={`/api/prestataire/missions/${mission.id}/review`} />}
      {reviewed?.provider_to_restaurant && <p className="text-[13.5px] text-ink-muted">{t("mission.reviewDone")}</p>}
      {mission.status === "annule" && !quote && <p className="text-[13.5px] text-ink-muted">{t("mission.cancelled")}</p>}
      {canCancel("provider", mission.status, mission.metier) &&
        (() => {
          const q = costNow(mission, "provider");
          return (
            <CancelCard
              cancelUrl={`/api/prestataire/missions/${mission.id}/cancel`}
              body={{}}
              reasons={PROVIDER_REASONS}
              costText={describeCostT(tr, "provider", q, eur)}
              severity={q.band}
              title={t("mission.cancel.title")}
              extraWarning={t("mission.cancel.warning")}
              confirmLabel={t("mission.cancel.confirm")}
            />
          );
        })()}
    </div>
  );
}
