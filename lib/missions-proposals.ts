import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { logEvent, getMission } from "./missions";
import { mailMission as mail } from "./missions-notify";
import { getForProvider } from "./provider-missions";
import type { ProviderRow } from "./providers";
import { dateLabelFr } from "./mission-team-message";
import { loadProposalState, rulesState } from "./missions-proposals-state";
import { linkFiles } from "./missions-files-link";
import {
  autoChoice,
  dueProposalReminders,
  judgeChoose,
  judgeReject,
  judgeSubmit,
  proposalDeadlines,
  sanitizeProposals,
  sanitizeReasons,
  validateProposals,
  validateReasons,
  type ChosenBy,
  type DueProposalReminder,
  type ProposalIssue,
  type ReasonIssue,
} from "./mission-proposals";
import { addDays } from "./console-journey";

// ============================================================
// Réserver un prestataire (ADR 0084 §5, PR K) — les propositions créatives : déposer, choisir, refuser, retenir d'office.
//
// Les règles vivent dans lib/mission-proposals.ts (pures, testées) ; ce fichier les applique à Supabase.
// Chaque passage est un compare-and-swap sur l'état de la mission (un double clic ne dépose ni ne choisit deux
// fois), laisse sa ligne dans `mission_events`, et chaque e-mail a son issue tracée. FAIL-OPEN : migration
// 20261013-1200 absente → « unavailable », rien n'est écrit à moitié.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

// ── Le prestataire dépose sa série ───────────────────────────

export type SubmitResult =
  | { ok: true; round: 1 | 2 }
  | { ok: false; reason: "not_found" | "not_expected" | "too_late" | "unavailable" }
  | { ok: false; reason: "invalid"; issues: ProposalIssue[] };

export async function submitProposals(missionId: string, provider: ProviderRow, raw: unknown): Promise<SubmitResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  const loaded = await loadProposalState(missionId);
  if (!loaded.ok) return unavailable;
  const s = loaded.state;
  const rs = rulesState(m, s);
  const today = todayInBrussels();
  const verdict = judgeSubmit(rs, today);
  if (verdict !== "ok") {
    if (verdict === "too_late") await logEvent(missionId, { kind: "proposals_refused", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "too_late", meta: { round: s.round + 1 } });
    return { ok: false, reason: verdict };
  }

  const input = sanitizeProposals(raw);
  const check = validateProposals(input);
  const round = (s.round + 1) as 1 | 2;
  if (!check.ok) {
    await logEvent(missionId, { kind: "proposals_refused", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "invalid", meta: { round, issues: check.issues.map((i) => `${i.field ?? ""}:${i.code}${i.index === undefined ? "" : `@${i.index}`}`) } });
    return { ok: false, reason: "invalid", issues: check.issues };
  }

  try {
    const admin = createAdminClient();
    let q = admin
      .from("missions")
      .update({ proposals_round: round, updated_at: new Date().toISOString() })
      .eq("id", missionId)
      .eq("provider_id", provider.id)
      .eq("status", "date_bloquee")
      .eq("proposals_round", s.round) // deux clics : une seule série
      .is("proposal_chosen_id", null);
    if (round === 2) q = q.not("proposals_rejected_at", "is", null);
    const { data: moved, error } = await q.select("id");
    if (error) throw error;
    if (!moved || moved.length === 0) return { ok: false, reason: "not_expected" };

    const { data: created, error: e2 } = await admin.from("mission_proposals").insert(input.map((p, i) => ({ mission_id: missionId, round, rank: i + 1, title: p.title, idea: p.idea, onsite: p.onsite, example_link: p.link }))).select("id, rank");
    if (e2) {
      // La série n'a pas pu s'écrire : le compteur revient, jamais « déposé » sans propositions.
      await admin.from("missions").update({ proposals_round: s.round }).eq("id", missionId).eq("proposals_round", round);
      throw e2;
    }
    // Les pièces jointes déjà déposées sont rattachées à leur idée (seuls les fichiers confirmés, de ce prestataire, non rattachés).
    for (const p of (created ?? []) as { id: string; rank: number }[]) await linkFiles(missionId, "proposal", "provider", input[p.rank - 1]?.files ?? [], p.id);
    const d = proposalDeadlines(m.shoot_date!);
    const late = round === 1 && today > d.providerDue;
    await logEvent(missionId, { kind: "proposals_submitted", actorKind: "provider", actorId: provider.user_id ?? undefined, meta: { round, count: input.length, late } });
    const lastDay = round === 1 ? addDays(d.autoFirst, -1) : addDays(d.autoSecond, -1);
    await mail(missionId, "restaurant", "proposals_received", { count: input.length, deadlineLabel: dateLabelFr(lastDay) });
    return { ok: true, round };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-proposals] submitProposals failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Le restaurateur choisit ──────────────────────────────────

export type ChooseResult = { ok: true; title: string } | { ok: false; reason: "not_found" | "not_expected" | "too_late" | "unknown_proposal" | "unavailable" };

export async function chooseProposal(missionId: string, restaurantId: string, userId: string, proposalId: unknown): Promise<ChooseResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  const loaded = await loadProposalState(missionId);
  if (!loaded.ok) return unavailable;
  const s = loaded.state;
  const verdict = judgeChoose(rulesState(m, s), todayInBrussels());
  if (verdict !== "ok") return { ok: false, reason: verdict };

  const pick = typeof proposalId === "string" ? s.proposals.find((p) => p.id === proposalId && p.round === s.round) : undefined;
  if (!pick) {
    await logEvent(missionId, { kind: "proposal_choice_refused", actorKind: "restaurant", actorId: userId, reason: "unknown_proposal" });
    return { ok: false, reason: "unknown_proposal" };
  }

  try {
    const moved = await lock(missionId, { restaurantId, round: s.round, proposalId: pick.id, by: "restaurant" });
    if (!moved) return { ok: false, reason: "not_expected" };
    await logEvent(missionId, { kind: "proposal_chosen", actorKind: "restaurant", actorId: userId, meta: { round: pick.round, rank: pick.rank } });
    await mail(missionId, "provider", "proposal_chosen", { title: pick.title });
    return { ok: true, title: pick.title };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-proposals] chooseProposal failed:", (e as Error).message);
    return unavailable;
  }
}

/** Verrouille la proposition retenue. Compare-and-swap : un seul choix, jamais deux. Faux = un autre l'a devancé. */
async function lock(missionId: string, o: { restaurantId?: string; round: number; proposalId: string; by: ChosenBy }): Promise<boolean> {
  const now = new Date().toISOString();
  let q = createAdminClient()
    .from("missions")
    .update({ proposal_chosen_id: o.proposalId, proposal_chosen_at: now, proposal_chosen_by: o.by, updated_at: now })
    .eq("id", missionId)
    .eq("status", "date_bloquee")
    .eq("proposals_round", o.round)
    .is("proposal_chosen_id", null);
  if (o.restaurantId) q = q.eq("restaurant_id", o.restaurantId);
  const { data, error } = await q.select("id");
  if (error) throw error;
  return !!data && data.length > 0;
}

// ── Aucune ne plaît : une seule nouvelle série ───────────────

export type RejectResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_expected" | "too_late" | "unavailable" }
  | { ok: false; reason: "invalid"; issues: ReasonIssue[] };

export async function rejectProposals(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<RejectResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  const loaded = await loadProposalState(missionId);
  if (!loaded.ok) return unavailable;
  const s = loaded.state;
  const verdict = judgeReject(rulesState(m, s), todayInBrussels());
  if (verdict !== "ok") return { ok: false, reason: verdict };

  const series = s.proposals.filter((p) => p.round === 1);
  const reasons = sanitizeReasons(raw);
  const check = validateReasons(reasons, series.map((p) => p.id));
  if (!check.ok) {
    await logEvent(missionId, { kind: "proposals_reject_refused", actorKind: "restaurant", actorId: userId, reason: "invalid", meta: { issues: check.issues.map((i) => `${i.id ?? ""}:${i.code}`) } });
    return { ok: false, reason: "invalid", issues: check.issues };
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: moved, error } = await admin
      .from("missions")
      .update({ proposals_rejected_at: now, updated_at: now })
      .eq("id", missionId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "date_bloquee")
      .eq("proposals_round", 1)
      .is("proposals_rejected_at", null) // deux clics : une seule demande
      .is("proposal_chosen_id", null)
      .select("id");
    if (error) throw error;
    if (!moved || moved.length === 0) return { ok: false, reason: "not_expected" };

    const writes = await Promise.all(series.map((p) => admin.from("mission_proposals").update({ rejection_reason: reasons[p.id] }).eq("id", p.id)));
    const failed = writes.find((w) => w.error);
    if (failed?.error) {
      // Les raisons n'ont pas pu s'écrire : la demande n'est PAS enregistrée.
      await admin.from("missions").update({ proposals_rejected_at: null }).eq("id", missionId).eq("proposals_round", 1);
      await admin.from("mission_proposals").update({ rejection_reason: null }).eq("mission_id", missionId).eq("round", 1);
      throw failed.error;
    }
    await logEvent(missionId, { kind: "proposals_rejected", actorKind: "restaurant", actorId: userId, meta: { round: 1, count: series.length } });
    await mail(missionId, "provider", "proposals_again", { deadlineLabel: dateLabelFr(proposalDeadlines(m.shoot_date!).secondLast) });
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-proposals] rejectProposals failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Le passage quotidien : retenir d'office, rappeler ────────

type CronRow = {
  id: string;
  restaurant_id: string;
  status: string;
  shoot_date: string;
  proposals_round: number;
  proposals_rejected_at: string | null;
  proposal_chosen_id: string | null;
};

export type ProposalsRun =
  | { ok: false; reason: "unavailable" }
  | { ok: true; today: string; missions: number; retained: number; reminders: { due: number; sent: number; failed: number; skipped: number } };

export async function runProposalsPass(now: Date = new Date()): Promise<ProposalsRun> {
  const today = todayInBrussels(now);
  const admin = createAdminClient();
  let rows: CronRow[] = [];
  let sentSet = new Set<string>();
  try {
    // Les tournages des 8 prochains jours : au-delà, rien n'est encore dû ; passés, plus rien ne l'est.
    const { data, error } = await admin
      .from("missions")
      .select("id, restaurant_id, status, shoot_date, proposals_round, proposals_rejected_at, proposal_chosen_id")
      .eq("status", "date_bloquee")
      .gte("shoot_date", today)
      .lte("shoot_date", addDays(today, 8));
    if (error) throw error;
    rows = (data ?? []) as CronRow[];
    const { data: sent, error: e2 } = await admin.from("mission_reminders").select("mission_id, key, audience").in("key", ["propose", "choisir", "sans_proposition"]).in("mission_id", rows.map((r) => r.id).concat("00000000-0000-0000-0000-000000000000"));
    if (e2) throw e2;
    sentSet = new Set(((sent ?? []) as { mission_id: string; key: string; audience: string }[]).map((x) => `${x.mission_id}:${x.key}:${x.audience}`));
    const { error: e3 } = await admin.from("mission_proposals").select("id").limit(1);
    if (e3) throw e3;
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-proposals] passage impossible:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }

  // 1. Retenir d'office (silence, ou seconde série jamais venue) : tout le monde est prévenu.
  let retained = 0;
  const handled = new Set<string>();
  for (const r of rows) {
    const choice = autoChoice({ status: r.status, shootDate: r.shoot_date, round: r.proposals_round, rejectedAt: r.proposals_rejected_at, chosenId: r.proposal_chosen_id }, today);
    if (!choice) continue;
    handled.add(r.id);
    if (await retain(r, choice)) retained++;
  }

  // 2. Rappeler (les missions tout juste retenues n'ont plus rien à se faire rappeler).
  const due = dueProposalReminders(
    rows.filter((r) => !handled.has(r.id)).map((r) => ({ id: r.id, status: r.status, shootDate: r.shoot_date, round: r.proposals_round, rejectedAt: r.proposals_rejected_at, chosenId: r.proposal_chosen_id })),
    today,
    sentSet
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = { due: due.length, sent: 0, failed: 0, skipped: 0 };
  for (const d of due) {
    const row = byId.get(d.missionId);
    if (!row) continue;
    const outcome = await remind(d, row);
    out[outcome]++;
  }
  return { ok: true, today, missions: rows.length, retained, reminders: out };
}

async function retain(r: CronRow, choice: { round: 1 | 2; kind: "auto" | "fallback" }): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().from("mission_proposals").select("id, title").eq("mission_id", r.id).eq("round", choice.round).eq("rank", 1).maybeSingle();
    if (error) throw error;
    const first = data as { id: string; title: string } | null;
    if (!first) throw new Error(`pas de 1re proposition en série ${choice.round}`);
    if (!(await lock(r.id, { round: r.proposals_round, proposalId: first.id, by: choice.kind }))) return false; // un autre passage, ou le choix manuel, l'a devancé
    await logEvent(r.id, { kind: "proposal_auto_chosen", actorKind: "system", reason: choice.kind, meta: { round: choice.round, rank: 1 } });
    await Promise.all([mail(r.id, "restaurant", "proposal_auto", { title: first.title, auto: choice.kind }), mail(r.id, "provider", "proposal_auto", { title: first.title, auto: choice.kind })]);
    return true;
  } catch (e) {
    console.error("[missions-proposals] retenue d'office échouée:", r.id, (e as Error).message);
    await logEvent(r.id, { kind: "proposal_auto_failed", actorKind: "system", reason: (e as Error).message });
    return false;
  }
}

const REMINDER_KIND = { propose: "proposals_due", choisir: "proposals_choose", sans_proposition: "proposals_missing" } as const;

async function remind(d: DueProposalReminder, r: CronRow): Promise<"sent" | "failed" | "skipped"> {
  const admin = createAdminClient();
  // 1. RÉSERVER : la clé primaire de `mission_reminders` garantit qu'un rappel ne part jamais deux fois.
  const { error: claim } = await admin.from("mission_reminders").insert({ mission_id: d.missionId, key: d.key, audience: d.audience });
  if (claim) {
    if (claim.code === "23505") return "skipped";
    console.error("[missions-proposals] réservation impossible:", claim.message);
    return "failed";
  }
  // 2. ENVOYER, sinon LIBÉRER : le passage suivant réessaie tant que la fenêtre du rappel est ouverte.
  const deadline = d.key === "propose" ? proposalDeadlines(r.shoot_date).providerLast : addDays(proposalDeadlines(r.shoot_date).autoFirst, -1);
  const count = d.key === "choisir" ? await currentCount(r.id) : undefined;
  const sent = await mail(d.missionId, d.audience, REMINDER_KIND[d.key], { deadlineLabel: dateLabelFr(d.key === "sans_proposition" ? r.shoot_date : deadline), ...(count ? { count } : {}) });
  if (sent) {
    await logEvent(d.missionId, { kind: "reminder_sent", actorKind: "system", meta: { key: d.key, audience: d.audience } });
    return "sent";
  }
  await admin.from("mission_reminders").delete().eq("mission_id", d.missionId).eq("key", d.key).eq("audience", d.audience);
  return "failed";
}

async function currentCount(missionId: string): Promise<number | undefined> {
  const { count } = await createAdminClient().from("mission_proposals").select("id", { count: "exact", head: true }).eq("mission_id", missionId).eq("round", 1);
  return count ?? undefined;
}
