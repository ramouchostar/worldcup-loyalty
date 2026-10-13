// ============================================================
// Réserver un prestataire (ADR 0084 §5) — les propositions créatives.
//
// La date est bloquée, le tournage est dans 7 jours ou plus. Le prestataire propose 2 ou 3 idées (la première
// est celle qu'il recommande), le restaurateur en choisit UNE ; une fois choisie, elle est verrouillée.
//
//   J-4  le prestataire a déposé sa série (au plus tard J-3 : ensuite c'est refusé)
//   J-2  silence du restaurateur : la 1re proposition est retenue d'office, tout le monde est prévenu
//   « Aucune ne me plaît » (jusqu'à J-3) : UNE nouvelle série, avec une raison par proposition ;
//        le prestataire a jusqu'à J-2, le restaurateur choisit jusqu'à J-1, sinon la 1re de la nouvelle
//        série est retenue ; sans nouvelle série, on retombe sur la 1re de la première.
//
// Fonctions PURES : le jour belge est injecté ; l'accès aux données est dans lib/missions-proposals.ts.
// ============================================================

import { addDays } from "./console-journey";

export const MIN_PROPOSALS = 2;
export const MAX_PROPOSALS = 3;
export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const IDEA_MIN = 30;
export const IDEA_MAX = 800;
export const ONSITE_MIN = 5;
export const ONSITE_MAX = 500;
export const LINK_MAX = 500;
export const REASON_MIN = 12;
export const REASON_MAX = 500;

export type ProposalInput = { title: string; idea: string; onsite: string; link: string };

export type ProposalField = "title" | "idea" | "onsite" | "link";
export type ProposalIssueCode = "too_few" | "too_many" | "empty" | "too_short" | "too_long" | "link_invalid" | "link_not_https" | "link_credentials" | "duplicate_title";
export type ProposalIssue = { code: ProposalIssueCode; index?: number; field?: ProposalField };

export function sanitizeProposals(raw: unknown): ProposalInput[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { proposals?: unknown }).proposals) ? (raw as { proposals: unknown[] }).proposals : [];
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max + 1) : "");
  return list.slice(0, MAX_PROPOSALS + 1).map((p) => {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    return { title: s(o.title, TITLE_MAX), idea: s(o.idea, IDEA_MAX), onsite: s(o.onsite, ONSITE_MAX), link: s(o.link, LINK_MAX) };
  });
}

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Une série est recevable avec 2 ou 3 propositions, chacune complète. Le lien est affiché au restaurateur et
 * cliqué : https seulement, sans identifiants dans l'adresse (hameçonnage). Deux titres identiques sont refusés :
 * ce ne sont pas deux idées.
 */
export function validateProposals(list: readonly ProposalInput[]): { ok: boolean; issues: ProposalIssue[] } {
  const issues: ProposalIssue[] = [];
  if (list.length < MIN_PROPOSALS) issues.push({ code: "too_few" });
  if (list.length > MAX_PROPOSALS) issues.push({ code: "too_many" });
  const len = (index: number, field: ProposalField, value: string, min: number, max: number) => {
    if (value.length === 0) issues.push({ code: "empty", index, field });
    else if (value.length < min) issues.push({ code: "too_short", index, field });
    else if (value.length > max) issues.push({ code: "too_long", index, field });
  };
  list.slice(0, MAX_PROPOSALS).forEach((p, index) => {
    len(index, "title", p.title, TITLE_MIN, TITLE_MAX);
    len(index, "idea", p.idea, IDEA_MIN, IDEA_MAX);
    len(index, "onsite", p.onsite, ONSITE_MIN, ONSITE_MAX);
    if (p.link.length === 0) return void issues.push({ code: "empty", index, field: "link" });
    if (p.link.length > LINK_MAX) return void issues.push({ code: "too_long", index, field: "link" });
    let url: URL;
    try {
      url = new URL(p.link);
    } catch {
      return void issues.push({ code: "link_invalid", index, field: "link" });
    }
    if (url.protocol !== "https:") return void issues.push({ code: "link_not_https", index, field: "link" });
    if (url.username || url.password) return void issues.push({ code: "link_credentials", index, field: "link" });
    if (!url.hostname.includes(".")) issues.push({ code: "link_invalid", index, field: "link" });
  });
  const seen = new Set<string>();
  list.slice(0, MAX_PROPOSALS).forEach((p, index) => {
    const k = norm(p.title);
    if (k && seen.has(k)) issues.push({ code: "duplicate_title", index, field: "title" });
    seen.add(k);
  });
  return { ok: issues.length === 0, issues };
}

export const PROPOSAL_ISSUE_TEXT: Record<ProposalIssueCode, string> = {
  too_few: "Propose au moins 2 idées : le restaurateur doit pouvoir choisir.",
  too_many: "3 idées au plus : au-delà, le choix devient difficile.",
  empty: "Ce champ est à remplir.",
  too_short: "Un peu plus de détail : le restaurateur doit comprendre l'idée sans t'appeler.",
  too_long: "C'est trop long : va à l'essentiel.",
  link_invalid: "Ce lien n'est pas une adresse valide.",
  link_not_https: "Le lien doit commencer par https://",
  link_credentials: "Retire l'identifiant et le mot de passe de l'adresse : partage un lien public.",
  duplicate_title: "Deux idées ne peuvent pas porter le même titre.",
};

// ── Les raisons d'un refus ───────────────────────────────────

/** `{ [id de la proposition]: raison }` : une raison pour CHAQUE proposition de la série. */
export function sanitizeReasons(raw: unknown): Record<string, string> {
  const o = raw && typeof raw === "object" ? ((raw as { reasons?: unknown }).reasons as unknown) : null;
  const out: Record<string, string> = {};
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o as Record<string, unknown>).slice(0, MAX_PROPOSALS + 1)) {
      if (typeof v === "string") out[k] = v.trim().slice(0, REASON_MAX + 1);
    }
  }
  return out;
}

export type ReasonIssue = { id: string; code: "missing" | "too_short" | "too_long" } | { id: null; code: "unknown_proposal" };

/** Chaque proposition de la série a sa raison (12 à 500 caractères) ; une raison pour une proposition inconnue est refusée. */
export function validateReasons(reasons: Record<string, string>, seriesIds: readonly string[]): { ok: boolean; issues: ReasonIssue[] } {
  const issues: ReasonIssue[] = [];
  for (const id of seriesIds) {
    const r = reasons[id];
    if (r === undefined || r.length === 0) issues.push({ id, code: "missing" });
    else if (r.length < REASON_MIN) issues.push({ id, code: "too_short" });
    else if (r.length > REASON_MAX) issues.push({ id, code: "too_long" });
  }
  if (Object.keys(reasons).some((k) => !seriesIds.includes(k))) issues.push({ id: null, code: "unknown_proposal" });
  return { ok: issues.length === 0, issues };
}

export const REASON_ISSUE_TEXT: Record<ReasonIssue["code"], string> = {
  missing: "Dis pourquoi cette idée ne te convient pas.",
  too_short: "Un peu plus de détail : le prestataire doit savoir quoi changer.",
  too_long: "C'est trop long : va à l'essentiel.",
  unknown_proposal: "Cette proposition n'existe plus : recharge la page.",
};

// ── Où en est la mission ─────────────────────────────────────

export type ProposalPhase =
  | "not_applicable" // pas de date bloquée : rien à proposer
  | "awaiting_proposals" // aucune série : le prestataire doit proposer
  | "choose" // première série déposée : le restaurateur choisit (ou refuse)
  | "awaiting_second" // série refusée : le prestataire dépose la seconde
  | "choose_second" // seconde série déposée : le restaurateur choisit
  | "chosen"; // verrouillée

export type ProposalMissionState = {
  status: string;
  shootDate: string | null;
  round: number;
  rejectedAt: string | null;
  chosenId: string | null;
};

export function proposalPhase(m: ProposalMissionState): ProposalPhase {
  if (m.chosenId) return "chosen";
  if (m.status !== "date_bloquee" || !m.shootDate) return "not_applicable";
  if (m.round <= 0) return "awaiting_proposals";
  if (m.round === 1) return m.rejectedAt ? "awaiting_second" : "choose";
  return "choose_second";
}

/** Les jours qui comptent, calculés depuis le jour du tournage. */
export function proposalDeadlines(shootDate: string) {
  return {
    /** Le prestataire doit avoir déposé sa série (rappel ce jour-là). */
    providerDue: addDays(shootDate, -4),
    /** Dernier jour où la série est encore acceptée. */
    providerLast: addDays(shootDate, -3),
    /** Dernier jour où le restaurateur peut refuser la série (la seconde doit rester faisable). */
    rejectLast: addDays(shootDate, -3),
    /** Dernier jour où le prestataire peut déposer la seconde série. */
    secondLast: addDays(shootDate, -2),
    /** Silence : la 1re proposition est retenue d'office à partir de ce jour (première série). */
    autoFirst: addDays(shootDate, -2),
    /** Idem pour la seconde série, et repli quand la seconde n'est jamais venue. */
    autoSecond: addDays(shootDate, -1),
  };
}

export type SubmitVerdict = "ok" | "not_expected" | "too_late";

/** Le prestataire peut-il déposer une série aujourd'hui ? */
export function judgeSubmit(m: ProposalMissionState, today: string): SubmitVerdict {
  const phase = proposalPhase(m);
  if (phase !== "awaiting_proposals" && phase !== "awaiting_second") return "not_expected";
  const d = proposalDeadlines(m.shootDate!);
  const last = phase === "awaiting_proposals" ? d.providerLast : d.secondLast;
  return today <= last ? "ok" : "too_late";
}

export type ChooseVerdict = "ok" | "not_expected" | "too_late";

/** Le restaurateur peut-il choisir aujourd'hui ? (Jusqu'à la veille du tournage : l'automatisme passe avant.) */
export function judgeChoose(m: ProposalMissionState, today: string): ChooseVerdict {
  const phase = proposalPhase(m);
  if (phase !== "choose" && phase !== "choose_second") return "not_expected";
  return today < m.shootDate! ? "ok" : "too_late";
}

export type RejectVerdict = "ok" | "not_expected" | "too_late";

/** « Aucune ne me plaît » : seulement sur la première série, et assez tôt pour que la seconde soit faisable. */
export function judgeReject(m: ProposalMissionState, today: string): RejectVerdict {
  if (proposalPhase(m) !== "choose") return "not_expected";
  return today <= proposalDeadlines(m.shootDate!).rejectLast ? "ok" : "too_late";
}

export type AutoChoice = { round: 1 | 2; kind: "auto" | "fallback" };

/**
 * La retenue d'office du jour, s'il y en a une : silence du restaurateur, ou seconde série jamais venue.
 * Toujours la PREMIÈRE proposition de la série concernée (celle que le prestataire recommande).
 */
export function autoChoice(m: ProposalMissionState, today: string): AutoChoice | null {
  const phase = proposalPhase(m);
  if (phase === "not_applicable" || phase === "chosen" || phase === "awaiting_proposals") return null;
  const d = proposalDeadlines(m.shootDate!);
  if (phase === "choose") return today >= d.autoFirst ? { round: 1, kind: "auto" } : null;
  if (phase === "choose_second") return today >= d.autoSecond ? { round: 2, kind: "auto" } : null;
  return today >= d.autoSecond ? { round: 1, kind: "fallback" } : null; // awaiting_second
}

// ── Les rappels du cron ──────────────────────────────────────

export type ProposalReminderKey = "propose" | "choisir" | "sans_proposition";
export type ProposalReminderAudience = "provider" | "restaurant" | "platform";
export type DueProposalReminder = { missionId: string; key: ProposalReminderKey; audience: ProposalReminderAudience };

/**
 * - **propose** (prestataire) : de J-4 à J-3, tant qu'aucune série n'est déposée.
 * - **choisir** (restaurateur) : de J-4 à J-3, une série attend son choix (la retenue d'office tombe à J-2).
 * - **sans_proposition** (plateforme) : à partir de J-2, aucune série n'est venue : la plateforme appelle le prestataire.
 */
export function dueProposalReminders(missions: readonly (ProposalMissionState & { id: string })[], today: string, alreadySent: ReadonlySet<string>): DueProposalReminder[] {
  const out: DueProposalReminder[] = [];
  for (const m of missions) {
    const phase = proposalPhase(m);
    if (phase === "not_applicable" || phase === "chosen" || !m.shootDate) continue;
    if (m.shootDate < today) continue;
    const d = proposalDeadlines(m.shootDate);
    const push = (key: ProposalReminderKey, audience: ProposalReminderAudience) => {
      if (!alreadySent.has(`${m.id}:${key}:${audience}`)) out.push({ missionId: m.id, key, audience });
    };
    if (phase === "awaiting_proposals") {
      if (today >= d.providerDue && today <= d.providerLast) push("propose", "provider");
      if (today >= d.autoFirst) push("sans_proposition", "platform");
    }
    if (phase === "choose" && today >= d.providerDue && today < d.autoFirst) push("choisir", "restaurant");
  }
  return out;
}

// ── Ce que lit chacun ────────────────────────────────────────

export type DeadlineKind = "provider" | "restaurant";

/** La date limite à dire à l'écran (ISO), selon qui doit agir. */
export function actionDeadline(m: ProposalMissionState): { who: DeadlineKind; day: string } | null {
  const phase = proposalPhase(m);
  if (phase === "not_applicable" || phase === "chosen") return null;
  const d = proposalDeadlines(m.shootDate!);
  switch (phase) {
    case "awaiting_proposals":
      return { who: "provider", day: d.providerDue };
    case "awaiting_second":
      return { who: "provider", day: d.secondLast };
    case "choose":
      return { who: "restaurant", day: addDays(d.autoFirst, -1) };
    case "choose_second":
      return { who: "restaurant", day: addDays(d.autoSecond, -1) };
  }
}

export const CHOSEN_BY_LABEL = {
  restaurant: "Choisie par le restaurateur",
  auto: "Retenue d'office : pas de réponse à temps",
  fallback: "Retenue d'office : la nouvelle série n'est pas venue à temps",
} as const;

export type ChosenBy = keyof typeof CHOSEN_BY_LABEL;
