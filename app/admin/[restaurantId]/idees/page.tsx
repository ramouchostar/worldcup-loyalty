import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { listRecentDecisions, listTodayIdeas, markSeen, type ProposalRow } from "@/lib/agents/proposals";
import { ASSISTANTS } from "@/lib/agents/types";
import { deadlineLabel, ideasSummary, outcomeLabel, replyCards } from "@/lib/agents/ideas-view";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { IdeasBoard, type IdeaCardData, type InProgressData, type RecentData } from "./IdeasBoard";

export const metadata = { title: "Idées du jour" };
export const dynamic = "force-dynamic";

// « Idées du jour » (ADR 0089, Brigade 03) — le premier onglet de la vue simple.
// Les assistants de la brigade y déposent leurs idées ; le gérant répond Oui,
// Non (avec une raison) ou Plus tard. Maquette validée par Mehdi le 2026-11-05 :
// https://claude.ai/artifact/UVKGAsFoEdLxtNruZotYp1

const nf = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 });

function toCard(row: ProposalRow, nowMs: number): IdeaCardData {
  const a = ASSISTANTS[row.assistant];
  const idea = row.content;
  return {
    id: row.id,
    name: a.name,
    post: a.post,
    photo: a.photo,
    deadline: deadlineLabel(row.decide_by, nowMs),
    title: idea.title,
    question: idea.question,
    lines: idea.lines,
    estimate: idea.estimate
      ? { text: `Entre ${nf.format(idea.estimate.low)} et ${nf.format(idea.estimate.high)} ${idea.estimate.unit}`, basis: idea.estimate.basis }
      : null,
    yesLabel: idea.action.label ? `Oui, ${idea.action.label.charAt(0).toLowerCase()}${idea.action.label.slice(1)}` : "Oui",
    replies: row.assistant === "louis" ? replyCards(idea, nowMs) : undefined,
    repliesLeft: row.assistant === "louis" && typeof idea.remaining === "number" ? idea.remaining : undefined,
    needsTerms: idea.action.kind === "create_ad_request",
    preparedByTeam: row.origin === "equipe",
  };
}

function toInProgress(row: ProposalRow): InProgressData {
  const a = ASSISTANTS[row.assistant];
  const team = row.content.action.kind === "team" || row.content.action.kind === "update_fiche" || row.content.action.kind === "relay";
  return { id: row.id, name: a.name, photo: a.photo, title: row.content.title, error: row.execution_error, team };
}

function toRecent(row: ProposalRow): RecentData {
  return { id: row.id, label: `${ASSISTANTS[row.assistant].name} · ${row.content.title}`, outcome: outcomeLabel(row.status, row.refusal_reason), yes: row.status === "executee" };
}

export default async function IdeesPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Défense en profondeur — ne pas dépendre du seul layout (CVE-2025-29927).
  const access = await getAdminAccess(user.id, restaurantId);
  if (!access.isLegacyAdmin && !access.isOwner && !access.isSuperAdmin && access.seatRole === null) redirect("/join?reason=admin-required");

  const nowMs = Date.now();
  const dateLabel = new Date(nowMs).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Brussels" });
  const [today, recent] = await Promise.all([listTodayIdeas(restaurantId, nowMs), listRecentDecisions(restaurantId, 7, nowMs)]);

  if (today.unavailable) {
    return (
      <div className="space-y-5 max-w-2xl">
        <PageHeader title="Idées du jour" subtitle={dateLabel} />
        <EmptyState icon={Lightbulb} title="Les idées arrivent bientôt">
          Tes assistants se préparent. Tu les retrouveras ici chaque matin.
        </EmptyState>
      </div>
    );
  }

  // Le gérant a vu ses idées : la mesure « ouvre ses idées » (Brigade 06).
  // Le « vu » ne doit jamais empêcher l'affichage : markSeen journalise et continue.
  await markSeen(restaurantId, today.toDecide.map((r) => r.id), nowMs);

  return (
    <IdeasBoard
      restaurantId={restaurantId}
      dateLabel={dateLabel}
      summary={ideasSummary(today.toDecide.length)}
      ideas={today.toDecide.map((r) => toCard(r, nowMs))}
      inProgress={today.inProgress.map(toInProgress)}
      recent={"unavailable" in recent ? [] : recent.slice(0, 8).map(toRecent)}
    />
  );
}
