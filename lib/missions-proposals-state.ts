import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { actionDeadline, proposalPhase, type ChosenBy, type ProposalMissionState, type ProposalPhase } from "./mission-proposals";

// Réserver un prestataire (ADR 0084 §5, PR K) — l'état des idées de tournage d'une mission, en lecture seule : ce que lisent
// les pages et ce que lit le module des pièces jointes. Fichier à part, léger : il ne tire ni e-mail ni cron.

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

export type ProposalRow = { id: string; round: number; rank: number; title: string; idea: string; onsite: string; example_link: string; rejection_reason: string | null };

export type ProposalState = {
  round: number;
  rejectedAt: string | null;
  chosenId: string | null;
  chosenAt: string | null;
  chosenBy: ChosenBy | null;
  proposals: ProposalRow[];
};

const PROPOSAL_COLUMNS = "id, round, rank, title, idea, onsite, example_link, rejection_reason";

/** L'état des propositions d'une mission, ou « unavailable » si la migration n'est pas passée. */
export async function loadProposalState(missionId: string): Promise<{ ok: true; state: ProposalState } | typeof unavailable> {
  try {
    const admin = createAdminClient();
    const [{ data: m, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
      admin.from("missions").select("proposals_round, proposals_rejected_at, proposal_chosen_id, proposal_chosen_at, proposal_chosen_by").eq("id", missionId).maybeSingle(),
      admin.from("mission_proposals").select(PROPOSAL_COLUMNS).eq("mission_id", missionId).order("round", { ascending: true }).order("rank", { ascending: true }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const r = m as { proposals_round: number; proposals_rejected_at: string | null; proposal_chosen_id: string | null; proposal_chosen_at: string | null; proposal_chosen_by: ChosenBy | null } | null;
    if (!r) return unavailable;
    return {
      ok: true,
      state: { round: r.proposals_round, rejectedAt: r.proposals_rejected_at, chosenId: r.proposal_chosen_id, chosenAt: r.proposal_chosen_at, chosenBy: r.proposal_chosen_by, proposals: (rows ?? []) as ProposalRow[] },
    };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-proposals] loadProposalState failed:", (e as Error).message);
    return unavailable;
  }
}

export function rulesState(mission: { status: string; shoot_date: string | null }, s: Pick<ProposalState, "round" | "rejectedAt" | "chosenId">): ProposalMissionState {
  return { status: mission.status, shootDate: mission.shoot_date, round: s.round, rejectedAt: s.rejectedAt, chosenId: s.chosenId };
}

/** Ce que l'écran affiche : la phase, la série en cours, la proposition choisie, la date limite. */
export function proposalView(mission: { status: string; shoot_date: string | null }, s: ProposalState) {
  const rs = rulesState(mission, s);
  const phase: ProposalPhase = proposalPhase(rs);
  const current = s.proposals.filter((p) => p.round === s.round);
  return {
    phase,
    current,
    first: s.proposals.filter((p) => p.round === 1),
    chosen: s.proposals.find((p) => p.id === s.chosenId) ?? null,
    deadline: actionDeadline(rs),
  };
}
