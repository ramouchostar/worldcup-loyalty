// Règles des séquences RESTAURATEUR (ADR 0077) — pures, date injectée,
// testées. Le moteur (lib/pro-sequence-runner.ts) charge les faits ; ce
// fichier décide seul QUI reçoit QUOI, et À QUELLE HEURE.
//
// Trois principes, écrits ici pour qu'on ne les « optimise » pas plus tard :
//
// 1. Pas de rattrapage massif (même règle que les membres, ADR 0063) : une
//    étape n'est due que dans les jours qui suivent sa date.
// 2. Un message de séquence restaurateur par personne et par jour, toutes
//    séquences confondues.
// 3. L'heure tourne entre quatre créneaux pour qu'on puisse apprendre la
//    bonne (ADR 0077 §4). Le créneau d'un envoi dépend de la personne et du
//    nombre d'envois qu'elle a déjà reçus — déterministe, rejouable, testable.

import { counted, dueStep, stableBucket, STEP_GRACE_DAYS, type HistoryRow } from "./sequence-rules";

export const PRO_SEQUENCE_KEYS = ["staff_setup", "staff_monthly"] as const;
export type ProSequenceKey = (typeof PRO_SEQUENCE_KEYS)[number];

export const STAFF_SETUP_OFFSETS_DAYS = [7, 14, 30] as const; // après la mise en ligne
export const MONTHLY_GRACE_DAYS = 2; // le bilan rate son jour (cron en panne) : 2 jours de rattrapage, pas plus

// Créneaux d'envoi, heure de Bruxelles « HHMM » — hors coup de feu de midi
// et du soir (ADR 0077 §4).
export const SEND_SLOTS = [900, 1100, 1500, 1730] as const;
export type SendSlot = (typeof SEND_SLOTS)[number];
export const EXPLORATION_PCT = 20; // part des envois qui explorent une fois l'heure fixée

const DAY_MS = 86_400_000;

// ─── Heure de Bruxelles ─────────────────────────────────────────────────────

export type BrusselsClock = { day: string; year: number; month: number; dayOfMonth: number; weekday: number; hhmm: number };

const FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function brusselsClock(now: Date): BrusselsClock {
  const parts = Object.fromEntries(FMT.formatToParts(now).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const dayOfMonth = Number(parts.day);
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    year,
    month,
    dayOfMonth,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    hhmm: Number(parts.hour) * 100 + Number(parts.minute),
  };
}

export function slotLabel(slot: number): string {
  const h = Math.floor(slot / 100);
  const m = slot % 100;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// ─── Le bilan du mois ───────────────────────────────────────────────────────

/** Jour du bilan : le 2, ou le 3 si le 2 tombe un lundi (récap) ou un jeudi (idée). */
export function monthlyDueDay(year: number, month: number): 2 | 3 {
  const weekday = new Date(Date.UTC(year, month - 1, 2)).getUTCDay();
  return weekday === 1 || weekday === 4 ? 3 : 2;
}

/** Le mois couvert par un bilan envoyé en (year, month) : le mois d'avant, « AAAAMM ». */
export function reportedMonth(year: number, month: number): number {
  return month === 1 ? (year - 1) * 100 + 12 : year * 100 + (month - 1);
}

// ─── Décision ───────────────────────────────────────────────────────────────

export type ProRecipientState = {
  userId: string;
  activatedAt: string | null; // mise en ligne (restaurants.activated_at)
  activeCodes: number | null; // QR d'équipe actifs ; null = migration des codes absente
  optedOut: ReadonlySet<string>;
  history: HistoryRow[]; // ses envois de séquences restaurateur pour cet établissement
};

export type Timing = { lockedSlot: number | null };

export type ProDecision = { key: ProSequenceKey; step: number; slot: SendSlot };

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS;
}

function countedSteps(s: ProRecipientState, key: string): number[] {
  return s.history.filter((h) => h.key === key && counted(h)).map((h) => h.step ?? 0);
}

export function evaluateProSequence(key: ProSequenceKey, s: ProRecipientState, now: Date): { step: number } | null {
  switch (key) {
    case "staff_setup": {
      if (s.activeCodes !== 0 || !s.activatedAt) return null;
      const step = dueStep(daysSince(s.activatedAt, now), STAFF_SETUP_OFFSETS_DAYS, countedSteps(s, key), STEP_GRACE_DAYS);
      return step ? { step } : null;
    }
    case "staff_monthly": {
      if (!s.activeCodes || s.activeCodes < 1) return null;
      const c = brusselsClock(now);
      const due = monthlyDueDay(c.year, c.month);
      if (c.dayOfMonth < due || c.dayOfMonth > due + MONTHLY_GRACE_DAYS) return null;
      const step = reportedMonth(c.year, c.month);
      if (countedSteps(s, key).includes(step)) return null;
      return { step };
    }
  }
}

/**
 * Créneau de l'envoi : chaque personne part d'un créneau tiré par hachage et
 * avance d'un cran à chaque envoi. Heure fixée par la plateforme : elle sert
 * 80 % du temps, les 20 % restants continuent d'explorer.
 */
export function slotFor(userId: string, key: string, previousSends: number, timing: Timing): SendSlot {
  const rotating = SEND_SLOTS[(stableBucket(userId, "slot") + previousSends) % SEND_SLOTS.length];
  const locked = SEND_SLOTS.find((s) => s === timing.lockedSlot);
  if (!locked) return rotating;
  const explore = stableBucket(`${userId}|${previousSends}`, `explore|${key}`) < EXPLORATION_PCT;
  return explore ? rotating : locked;
}

/**
 * Ce que cette personne reçoit maintenant pour cet établissement : au plus
 * UNE séquence, rien si elle a déjà eu un message de séquence aujourd'hui,
 * et seulement une fois son créneau passé.
 */
export function decideProSequence(s: ProRecipientState, enabled: ReadonlySet<string>, now: Date, timing: Timing): ProDecision | null {
  const clock = brusselsClock(now);
  const emails = s.history.filter((h) => counted(h) && h.channel === "email");
  if (emails.some((h) => brusselsClock(new Date(h.createdAt)).day === clock.day)) return null;

  for (const key of PRO_SEQUENCE_KEYS) {
    if (!enabled.has(key) || s.optedOut.has(key)) continue;
    const due = evaluateProSequence(key, s, now);
    if (!due) continue;
    const slot = slotFor(s.userId, key, emails.length, timing);
    if (clock.hhmm < slot) return null; // pas encore l'heure : le passage suivant le reprendra
    return { key, step: due.step, slot };
  }
  return null;
}
