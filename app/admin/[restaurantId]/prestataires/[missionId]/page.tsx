import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { getMission, getProviderName, loadTemplate, marketplaceEnabled } from "@/lib/missions";
import { stepsFor } from "@/lib/mission-brief";
import { hasShoot } from "@/lib/mission-metier";
import { getUserLocale } from "@/lib/user-locale";
import { dayLabel, formatEurosL, getT, type MessageKey } from "@/lib/i18n";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { todayInBrussels } from "@/lib/qr-funnel";
import { BriefWizard } from "./BriefWizard";
import { MissionTracker } from "./MissionTracker";
import { QuoteCard } from "./QuoteCard";
import { getCurrentQuote } from "@/lib/provider-missions";
import { loadProfile } from "@/lib/providers-profile";
import { ProviderProfileCard } from "@/components/missions/ProviderProfileCard";
import { getPlan } from "@/lib/entitlements";
import { getTerms } from "@/lib/marketplace-settings";
import { ambitionHint, floorHint } from "@/lib/marketplace-budgets";
import { restaurantView } from "@/lib/mission-quote";
import { ShootPlanner } from "./ShootPlanner";
import { CancelCard } from "@/components/missions/CancelCard";
import { costNow } from "@/lib/missions-cancel";
import { RESTAURANT_REASONS, canCancel, describeCostT } from "@/lib/mission-cancel-rules";
import { priceBreakdown } from "@/lib/mission-money";
import { DeliveryReview, ReportReview, type ReportView } from "./DayOfReview";
import { listDeliveries, listRetouches } from "@/lib/missions-dayof";
import { RetouchForm } from "./RetouchForm";
import { categoriesFor, retouchState } from "@/lib/mission-retouch";
import { TeamNotice } from "./TeamNotice";
import { loadBlocked } from "@/lib/missions-dates";
import { buildCalendar, teamNoticeState } from "@/lib/mission-dates";
import { judgeConfirm } from "@/lib/mission-reminders";
import { PresenceCard } from "@/components/missions/PresenceCard";
import { conceptMessageT, teamMessageT } from "@/lib/mission-team-message";
import { loadProposalState, proposalView, rulesState } from "@/lib/missions-proposals-state";
import { judgeReject } from "@/lib/mission-proposals";
import { ProposalChosen, ProposalsChoose, type IdeaView } from "./ProposalsCard";
import { listFiles } from "@/lib/missions-files";
import { AttachmentList } from "@/components/missions/AttachmentList";
import { MessagesCard } from "@/components/missions/MessagesCard";
import { ReviewCard } from "@/components/missions/ReviewCard";
import { providerReviewSummary, reviewedDirections } from "@/lib/missions-reviews";
import { canReview } from "@/lib/mission-reviews";
import { listMessages, unreadCounts } from "@/lib/missions-messages";
import { canWrite as canWriteMessage, contactsUnlocked } from "@/lib/mission-messages";
import { BatCard, type ProofView } from "./BatCard";
import { listProofs } from "@/lib/missions-bat-state";
import { batChecklistT, batPhase, batSummaryT, correctionRoundsLeft } from "@/lib/mission-print";
import { ChangesCard, type ChangeView } from "./ChangesCard";
import { listChanges } from "@/lib/missions-changes-state";
import { judgeChangeRequest } from "@/lib/mission-changes";
import { Card, SectionLabel } from "@/components/admin/ui";

// ADR 0084 — une mission : l'assistant de brief tant que c'est un brouillon,
// puis le suivi (frise, brief verrouillé) une fois envoyée.
export default async function MissionPage({ params }: { params: Promise<{ restaurantId: string; missionId: string }> }) {
  const { restaurantId, missionId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  if (!marketplaceEnabled(access.isSuperAdmin)) notFound();
  const locale = await getUserLocale(user.id);
  const tr = getT(locale);
  const { t } = tr;
  const eur = (cents: number) => formatEurosL(cents, locale);

  const found = await getMission(missionId, restaurantId);
  if (!found.ok) {
    return (
      <div className="space-y-6 max-w-xl">
        <PageHeader title={t("rest.list.title")} />
        <EmptyState icon={Hourglass} title={t("mission.notOpen.title")}>
          {t("mission.notOpen.body")}
        </EmptyState>
      </div>
    );
  }
  const mission = found.mission;
  if (!mission) notFound();

  const tpl = await loadTemplate(mission.metier);
  if (!tpl) notFound();
  const providerName = await getProviderName(mission.provider_id);
  // Le nom du prestataire, ou « le vidéaste » / « le graphiste »… dans les mots du restaurateur.
  const fallbackName = providerName ?? t(`rest.whoCap.${mission.metier}` as MessageKey);
  const back = (
    <Link href={`/admin/${restaurantId}/prestataires`} className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
      <ChevronLeft className="w-4 h-4" aria-hidden /> {t("rest.back")}
    </Link>
  );

  if (mission.status === "brief") {
    const briefFiles = await listFiles(mission.id, "brief");
    return (
      <div className="space-y-4">
        {back}
        <PageHeader title={t("rest.mission.draftTitle", { metier: t(`metier.${mission.metier}` as MessageKey).toLowerCase() })} subtitle={t(`rest.mission.draftSub.${mission.metier}` as MessageKey)} />
        <BriefWizard
          restaurantId={restaurantId}
          missionId={mission.id}
          template={tpl.template}
          steps={stepsFor(mission.metier)}
          initialAnswers={mission.brief ?? {}}
          today={todayInBrussels()}
          providerName={providerName}
          initialFiles={briefFiles}
        />
      </div>
    );
  }

  // Le devis reçu, au prix que PAIE ce restaurateur selon son plan d'aujourd'hui (figé au paiement, pas ici).
  const quote = mission.status === "devis" ? await getCurrentQuote(mission.id) : null;
  const plan = quote ? await getPlan(restaurantId) : null;
  const { terms } = quote ? await getTerms() : { terms: undefined };
  const priceView = quote && plan ? restaurantView(quote.price_cents, plan, terms) : null;
  const budget = typeof mission.brief?.budget_cents === "number" ? mission.brief.budget_cents : null;

  // Après l'acceptation du devis : le restaurateur choisit sa date dans les jours libres du prestataire.
  const today = todayInBrussels();
  let calendar = null as ReturnType<typeof buildCalendar> | null;
  let calendarDown = false;
  if (mission.status === "accepte" && mission.provider_id && hasShoot(mission.metier)) {
    const loaded = await loadBlocked(mission.provider_id, today, mission.id);
    if (loaded.ok) calendar = buildCalendar(today, loaded.blocked);
    else calendarDown = true;
  }

  // Une fois la date réservée : le message à l'équipe, prêt à partager.
  const a = mission.brief ?? {};
  const contact = (a.contact as { name?: string; phone?: string } | undefined) ?? {};
  const hasDate = !!mission.shoot_date && !!mission.shoot_start && mission.status !== "annule";
  // Les idées de tournage (PR K) : migration absente → rien d'affiché, le reste de la mission fonctionne.
  const files = await listFiles(mission.id);
  const filesBase = `/api/admin/missions/${mission.id}/files`;
  const filesQuery = `?restaurantId=${encodeURIComponent(restaurantId)}`;
  // Les demandes de modification (PR M) : migration absente → rien d'affiché, le reste de la mission fonctionne.
  const changesRes = mission.status === "envoye" || mission.status === "devis" ? null : await listChanges(mission.id);
  const changePlan = changesRes?.ok && changesRes.changes.some((c) => c.status === "quoted") ? await getPlan(restaurantId) : null;
  const changeTerms = changePlan ? (await getTerms()).terms : undefined;
  const changeViews: ChangeView[] = changesRes?.ok
    ? changesRes.changes.map((c) => ({
        id: c.id,
        seq: c.seq,
        status: c.status,
        categories: c.categories,
        description: c.description,
        files: files.filter((f) => f.scope === "change" && f.ref === `change-${c.seq}`),
        paidCents: c.status === "accepted" ? c.paid_cents : c.supplement_cents === null ? null : changePlan ? priceBreakdown(c.supplement_cents, changePlan, changeTerms).paidCents : null,
        deltaDays: c.delta_days,
        providerNote: c.provider_note,
        declineReason: c.decline_reason,
      }))
    : [];
  const changeVerdict = changesRes?.ok ? judgeChangeRequest({ status: mission.status, shootDate: mission.shoot_date, changes: changesRes.changes }, today) : "not_now";
  const pstate = hasDate ? await loadProposalState(mission.id) : null;
  const pview = pstate?.ok ? proposalView(mission, pstate.state) : null;
  const toIdea = (p: { id: string; rank: number; title: string; idea: string; onsite: string; example_link: string }): IdeaView => ({ id: p.id, rank: p.rank, title: p.title, idea: p.idea, onsite: p.onsite, link: p.example_link, files: files.filter((f) => f.scope === "proposal" && f.ref === p.id) });
  const teamMsg = hasDate
    ? teamMessageT(tr, {
        shootDate: mission.shoot_date!,
        startTime: mission.shoot_start!,
        providerName: providerName ?? t("rest.yourProvider"),
        roles: Array.isArray(a.roles) ? (a.roles as string[]) : [],
        kitchen: typeof a.kitchen === "string" ? a.kitchen : undefined,
        contactName: contact.name,
        contactPhone: contact.phone,
        concept: pview?.chosen ? { title: pview.chosen.title, onsite: pview.chosen.onsite } : undefined,
      })
    : null;

  // Le jour J : compte-rendu à confirmer, puis livraison à valider.
  const report = mission.report as (ReportView & Record<string, unknown>) | null;
  const reportState = mission.report_confirmed_at ? "confirmed" : mission.report_contested_at ? "contested" : "pending";
  const deliveries = mission.delivered_at ? await listDeliveries(mission.id) : [];
  const retouches = mission.retouch_rounds_used > 0 ? await listRetouches(mission.id) : [];
  const retouch = retouchState(mission.status, mission.retouch_rounds_used, mission.metier);
  // La messagerie : migration absente → fil vide (écrire répond « pas encore disponible »), le reste fonctionne.
  const thread = await listMessages(mission.id, "restaurant");
  const unread = (await unreadCounts([mission.id], "restaurant")).get(mission.id) ?? 0;
  // Le bon à tirer (impression) : migration absente → rien d'affiché, le reste de la mission fonctionne.
  const proofsRes = mission.metier === "impression" && ["production", "livre", "valide", "verse"].includes(mission.status) ? await listProofs(mission.id) : null;
  const profileRes = mission.provider_id ? await loadProfile(mission.provider_id) : null;
  const reviewSummary = mission.provider_id ? await providerReviewSummary(mission.provider_id) : null;
  const reviewed = canReview(mission.status) ? await reviewedDirections(mission.id) : null;
  const batSigned = !!proofsRes?.ok && proofsRes.proofs.some((p) => p.status === "signed");

  // Annuler : le devis se décline (carte « Décliner ce devis ») ; le reste s'annule ici, coût dit d'abord.
  const cancelQuote = canCancel("restaurant", mission.status, mission.metier) && mission.status !== "devis" && !batSigned ? costNow(mission, "restaurant") : null;

  return (
    <div className="space-y-6 max-w-xl">
      {back}
      <MissionTracker mission={mission} template={tpl.template} providerName={providerName} tr={tr} />
      {profileRes?.ok && <ProviderProfileCard name={fallbackName} profile={profileRes.profile} reviews={reviewSummary} tr={tr} />}
      {!profileRes?.ok && reviewSummary && <ProviderProfileCard name={fallbackName} profile={null} reviews={reviewSummary} tr={tr} />}
      {proofsRes?.ok && mission.status === "production" && (
        <BatCard
          restaurantId={restaurantId}
          missionId={mission.id}
          providerName={fallbackName}
          phase={batPhase(proofsRes.proofs)}
          proofs={proofsRes.proofs.map((p): ProofView => ({ id: p.id, round: p.round, status: p.status, links: p.links, message: p.message, corrections: p.corrections, signedName: p.signed_name, signedAt: p.signed_at }))}
          checklist={batChecklistT(mission.brief, tr)}
          summary={batSummaryT(mission.brief, tr)}
          correctionsLeft={correctionRoundsLeft(proofsRes.proofs)}
        />
      )}
      {!hasShoot(mission.metier) && !(mission.metier === "impression" && mission.status === "production" && proofsRes?.ok) && (mission.status === "accepte" || mission.status === "production") && (
        <Card className="space-y-1">
          <SectionLabel>{mission.status === "accepte" ? t("rest.mission.soon") : t("rest.mission.inCreation")}</SectionLabel>
          <p className="text-[13.5px] text-ink-muted">
            {mission.status === "accepte" ? t("rest.mission.soonBody", { who: fallbackName }) : t("rest.mission.inCreationBody", { who: fallbackName })}
            {typeof mission.brief?.deadline === "string" ? t("rest.mission.wishedDelivery", { date: dayLabel(mission.brief.deadline, locale) }) : ""}
          </p>
        </Card>
      )}
      {files.some((f) => f.scope === "brief") && (
        <Card className="space-y-2">
          <SectionLabel>{t("rest.mission.briefFiles")}</SectionLabel>
          <AttachmentList locale={locale} files={files.filter((f) => f.scope === "brief")} base={filesBase} query={filesQuery} />
        </Card>
      )}
      <MessagesCard
        me="restaurant"
        otherName={fallbackName}
        messages={thread}
        sendUrl={`/api/admin/missions/${mission.id}/messages`}
        readUrl={`/api/admin/missions/${mission.id}/messages/read`}
        extra={{ restaurantId }}
        canWrite={canWriteMessage(mission.status)}
        contactsLocked={!contactsUnlocked(mission.status)}
        unread={unread}
      />
      {changesRes?.ok && (changeViews.length > 0 || changeVerdict === "ok") && (
        <ChangesCard
          restaurantId={restaurantId}
          missionId={mission.id}
          providerName={fallbackName}
          changes={changeViews}
          blocked={changeVerdict === "ok" ? null : t(`rc.change.blocked.${changeVerdict}` as MessageKey)}
          filesBase={filesBase}
          filesQuery={filesQuery}
        />
      )}
      {report && mission.report_submitted_at && (
        <ReportReview restaurantId={restaurantId} missionId={mission.id} providerName={fallbackName} report={report} state={reportState} contestNote={mission.report_contest_note} />
      )}
      {[...deliveries].reverse().map((d, i) => (
        <DeliveryReview
          key={d.id}
          restaurantId={restaurantId}
          missionId={mission.id}
          providerName={fallbackName}
          links={d.links}
          message={d.message}
          version={d.round}
          superseded={i > 0}
          canValidate={mission.status === "livre" && i === 0}
          validated={i === 0 && (mission.status === "valide" || mission.status === "verse")}
          print={mission.metier === "impression"}
        />
      ))}
      {mission.status === "livre" && retouch.can && (
        <RetouchForm restaurantId={restaurantId} missionId={mission.id} categories={categoriesFor(mission.metier)} roundsLeft={retouch.left} withTimecode={mission.metier === "video"} />
      )}
      {mission.status === "livre" && !retouch.can && retouch.reason === "print" && (
        <p className="text-[13.5px] text-ink-muted">{t("rest.mission.printRetouch")}</p>
      )}
      {mission.status === "livre" && !retouch.can && retouch.reason === "no_rounds_left" && (
        <p className="text-[13.5px] text-ink-muted">{t("rest.mission.noRounds")}</p>
      )}
      {mission.status === "retouche" && (
        <Card className="space-y-2">
          <SectionLabel>{t("rest.mission.retouchRunning")}</SectionLabel>
          <p className="text-[13.5px] text-ink-muted">{t("rest.mission.retouchRunningBody", { name: fallbackName, count: retouches.at(-1)?.notes.length ?? 0 })}</p>
        </Card>
      )}
      {mission.status === "accepte" && calendar && <ShootPlanner restaurantId={restaurantId} missionId={mission.id} providerName={providerName} days={calendar} />}
      {calendarDown && <p className="text-[13.5px] text-ink-muted">{t("rest.mission.calendarDown")}</p>}
      {hasDate && teamMsg && (
        <>
          <Card className="space-y-1">
            <SectionLabel>{t("rest.mission.shoot")}</SectionLabel>
            <p className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{t("rest.mission.shootWhen", { date: dayLabel(mission.shoot_date!, locale), time: mission.shoot_start ?? "" })}</p>
            <p className="text-[13.5px] text-ink-muted">{t("rest.mission.shootWith", { name: providerName ?? t("rest.mission.yourProvider"), contact: [contact.name, contact.phone].filter(Boolean).join(" · ") || t("rest.mission.contactTbd") })}</p>
          </Card>
          {pview && pstate?.ok && (pview.phase === "choose" || pview.phase === "choose_second") && pview.deadline && (
            <ProposalsChoose
              restaurantId={restaurantId}
              missionId={mission.id}
              ideas={pview.current.map(toIdea)}
              providerName={fallbackName}
              deadlineLabel={dayLabel(pview.deadline.day, locale)}
              canReject={judgeReject(rulesState(mission, pstate.state), today) === "ok"}
              second={pview.phase === "choose_second"}
              filesBase={filesBase}
              filesQuery={filesQuery}
            />
          )}
          {pview && (pview.phase === "awaiting_proposals" || pview.phase === "awaiting_second") && pview.deadline && (
            <Card className="space-y-1">
              <SectionLabel>{t("rest.mission.ideaTitle")}</SectionLabel>
              <p className="text-[13.5px] text-ink-muted">
                {t("rest.mission.ideaPreparing", { name: fallbackName, what: t(pview.phase === "awaiting_second" ? "rest.mission.ideaWhat.second" : "rest.mission.ideaWhat.first"), date: dayLabel(pview.deadline.day, locale) })}
              </p>
            </Card>
          )}
          {pview?.chosen && pstate?.ok && pstate.state.chosenBy && (
            <ProposalChosen
              idea={toIdea(pview.chosen)}
              by={pstate.state.chosenBy}
              filesBase={filesBase}
              filesQuery={filesQuery}
              teamUpdate={conceptMessageT(tr, { shootDate: mission.shoot_date!, startTime: mission.shoot_start!, providerName: providerName ?? t("rest.yourProvider"), title: pview.chosen.title, onsite: pview.chosen.onsite })}
            />
          )}
          {mission.status === "date_bloquee" && (
            <PresenceCard
              confirmUrl={`/api/admin/missions/${mission.id}/confirm`}
              body={{ restaurantId }}
              icsUrl={`/api/admin/missions/${mission.id}/ics?restaurantId=${encodeURIComponent(restaurantId)}`}
              verdict={judgeConfirm(mission.shoot_date, today)}
              selfConfirmed={!!mission.j2_confirmed_restaurant_at}
              otherConfirmed={!!mission.j2_confirmed_provider_at}
              otherName={fallbackName}
            />
          )}
          {mission.status === "date_bloquee" && (
            <TeamNotice restaurantId={restaurantId} missionId={mission.id} message={teamMsg} state={teamNoticeState(mission.shoot_date!, today, !!mission.team_notified_at)} />
          )}
        </>
      )}
      {quote && priceView && (
        <QuoteCard
          restaurantId={restaurantId}
          missionId={mission.id}
          providerName={providerName}
          quote={{ hours: quote.hours, deliveryDays: quote.delivery_days, included: quote.included, excluded: quote.excluded, hypotheses: quote.hypotheses }}
          view={{ paidCents: priceView.paidCents, depositCents: priceView.depositCents, balanceCents: priceView.balanceCents, depositPct: priceView.depositBps / 100 }}
          budgetCents={budget}
          canDecline
        />
      )}
      {reviewed && !reviewed.restaurant_to_provider && <ReviewCard audience="restaurant" url={`/api/admin/missions/${mission.id}/review`} extra={{ restaurantId }} />}
      {reviewed?.restaurant_to_provider && <p className="text-[13.5px] text-ink-muted">{t("rest.mission.reviewDone")}</p>}
      {cancelQuote && (
        <CancelCard
          cancelUrl={`/api/admin/missions/${mission.id}/cancel`}
          body={{ restaurantId }}
          reasons={RESTAURANT_REASONS}
          costText={describeCostT(tr, "restaurant", cancelQuote, eur)}
          severity={cancelQuote.band}
          title={mission.status === "envoye" ? t("rest.mission.cancelWithdraw") : t("rest.mission.cancelTitle")}
          confirmLabel={t("rest.mission.cancelConfirm")}
        />
      )}
    </div>
  );
}
