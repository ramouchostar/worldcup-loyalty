// Règles des séquences membres (ADR 0063 §1-§2, §6) — pures, date injectée,
// testées. Le moteur (lib/sequence-runner.ts) charge les faits ; ce fichier
// décide seul QUI reçoit QUOI aujourd'hui.
//
// Trois principes, écrits ici pour qu'on ne les « optimise » pas plus tard :
//
// 1. Pas de rattrapage massif. Une étape n'est due que dans les quelques jours
//    qui suivent sa date (`STEP_GRACE_DAYS`) : allumer une séquence ne déverse
//    pas trois semaines de relances sur tous les inscrits d'avant.
// 2. Deux séquences différentes ne se suivent jamais à moins d'une semaine
//    (priorité ci-dessous) ; les étapes d'une même séquence gardent leur
//    calendrier.
// 3. Le groupe témoin est STABLE : un membre tiré au sort pour une séquence y
//    reste pour toutes ses étapes (hachage déterministe, pas de hasard par
//    envoi), sinon on comparerait des membres à moitié relancés.

export const MEMBER_SEQUENCE_KEYS = ["first_ticket", "install_app", "referral_nudge", "team_invite"] as const;
export type MemberSequenceKey = (typeof MEMBER_SEQUENCE_KEYS)[number];

// Priorité quand plusieurs séquences sont dues le même jour : ce qui fait
// venir un premier ticket d'abord, ce qui garde le membre ensuite.
export const MEMBER_PRIORITY: readonly MemberSequenceKey[] = MEMBER_SEQUENCE_KEYS;

export const FIRST_TICKET_OFFSETS_DAYS = [2, 7, 21] as const; // après l'adhésion
export const INSTALL_APP_OFFSETS_DAYS = [3, 30] as const; // après le 1er ticket validé
export const STEP_GRACE_DAYS = 3;
export const TEAM_INVITE_DELAY_DAYS = 7; // après le 1er ticket validé
export const TEAM_INVITE_COOLDOWN_DAYS = 182; // une fois par semestre
export const REFERRAL_WINDOW_HOURS: readonly [number, number] = [12, 36]; // « le lendemain »
export const REFERRAL_COOLDOWN_DAYS = 14;
export const WEEKLY_CAP_DAYS = 7;
export const HOLDOUT_PCT = 10;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type HistoryRow = {
  key: string;
  step: number | null;
  status: string; // sent | delivered | bounced | complained | failed | holdout
  channel: string;
  createdAt: string;
};

export type MemberState = {
  userId: string;
  joinedAt: string;
  hasTeam: boolean;
  validatedCount: number;
  firstValidatedAt: string | null;
  installed: boolean;
  lastRedeemedAt: string | null;
  hasTeamChoices: boolean;
  optedOut: ReadonlySet<string>;
  history: HistoryRow[]; // ses envois de séquences membres dans cet établissement
};

export type MemberDecision = { key: MemberSequenceKey; step: number | null; holdout: boolean };

// Un envoi qui a « compté » : parti chez le fournisseur, ou retenu pour le
// témoin. Un échec (clé absente, adresse refusée) ne compte pas — on
// réessaiera tant que l'étape est dans sa fenêtre.
export function counted(row: HistoryRow): boolean {
  return row.status !== "failed";
}

/**
 * Étape due (1, 2, 3…) d'une séquence à étapes datées, ou null.
 * L'étape i est due entre `offsets[i]` et `offsets[i] + grace` jours ; jamais
 * si une étape égale ou plus avancée a déjà compté.
 */
export function dueStep(ageDays: number, offsets: readonly number[], countedSteps: number[], graceDays = STEP_GRACE_DAYS): number | null {
  let idx = -1;
  for (let i = 0; i < offsets.length; i++) if (ageDays >= offsets[i]) idx = i;
  if (idx < 0) return null;
  if (ageDays > offsets[idx] + graceDays) return null;
  const step = idx + 1;
  if (countedSteps.some((s) => s >= step)) return null;
  return step;
}

// FNV-1a 32 bits : même membre + même séquence → toujours le même tirage.
export function stableBucket(userId: string, key: string): number {
  let h = 0x811c9dc5;
  const s = `${userId}|${key}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

export function isHoldout(userId: string, key: string, pct = HOLDOUT_PCT): boolean {
  return stableBucket(userId, key) < pct;
}

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS;
}

function countedFor(state: MemberState, key: string): HistoryRow[] {
  return state.history.filter((h) => h.key === key && counted(h));
}

function recentlyCounted(state: MemberState, key: string, days: number, now: Date): boolean {
  return countedFor(state, key).some((h) => daysSince(h.createdAt, now) < days);
}

// Une séquence prise isolément : doit-elle partir aujourd'hui, et à quelle étape ?
export function evaluateSequence(key: MemberSequenceKey, s: MemberState, now: Date): { step: number | null } | null {
  switch (key) {
    case "first_ticket": {
      if (s.validatedCount > 0) return null;
      const steps = countedFor(s, key).map((h) => h.step ?? 0);
      const step = dueStep(daysSince(s.joinedAt, now), FIRST_TICKET_OFFSETS_DAYS, steps);
      return step ? { step } : null;
    }
    case "install_app": {
      if (s.validatedCount < 1 || s.installed || !s.firstValidatedAt) return null;
      const steps = countedFor(s, key).map((h) => h.step ?? 0);
      const step = dueStep(daysSince(s.firstValidatedAt, now), INSTALL_APP_OFFSETS_DAYS, steps);
      return step ? { step } : null;
    }
    case "referral_nudge": {
      if (!s.lastRedeemedAt) return null;
      const hours = (now.getTime() - new Date(s.lastRedeemedAt).getTime()) / HOUR_MS;
      if (hours < REFERRAL_WINDOW_HOURS[0] || hours > REFERRAL_WINDOW_HOURS[1]) return null;
      if (recentlyCounted(s, key, REFERRAL_COOLDOWN_DAYS, now)) return null;
      return { step: null };
    }
    case "team_invite": {
      if (s.hasTeam || s.validatedCount < 1 || !s.firstValidatedAt || !s.hasTeamChoices) return null;
      if (daysSince(s.firstValidatedAt, now) < TEAM_INVITE_DELAY_DAYS) return null;
      if (recentlyCounted(s, key, TEAM_INVITE_COOLDOWN_DAYS, now)) return null;
      return { step: null };
    }
  }
}

/**
 * Ce que ce membre reçoit aujourd'hui dans cet établissement : au plus UNE
 * séquence, la plus prioritaire parmi celles allumées et dues, et rien s'il a
 * déjà eu un e-mail de séquence (ou un tirage témoin) dans la semaine.
 */
export function decideMemberSequence(s: MemberState, enabled: ReadonlySet<string>, now: Date): MemberDecision | null {
  const memberKeys = new Set<string>(MEMBER_SEQUENCE_KEYS);
  // Le plafond hebdomadaire sépare deux séquences DIFFÉRENTES ; les étapes
  // d'une même séquence suivent leur propre calendrier (J+2 puis J+7 sont à
  // cinq jours l'une de l'autre, par dessein).
  const lastWeekKeys = new Set(
    s.history
      .filter((h) => memberKeys.has(h.key) && counted(h) && (h.channel === "email" || h.status === "holdout") && daysSince(h.createdAt, now) < WEEKLY_CAP_DAYS)
      .map((h) => h.key)
  );

  for (const key of MEMBER_PRIORITY) {
    if (!enabled.has(key) || s.optedOut.has(key)) continue;
    if ([...lastWeekKeys].some((k) => k !== key)) continue;
    const due = evaluateSequence(key, s, now);
    if (due) return { key, step: due.step, holdout: isHoldout(s.userId, key) };
  }
  return null;
}
