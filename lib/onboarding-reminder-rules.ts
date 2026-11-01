// Relance d'inscription restaurateur — règles pures, testées dans
// lib/onboarding-reminder-rules.test.ts. Remplace le bloc de fin du cron de
// notifications, qui n'a jamais rien envoyé : le cron est coupé par Vercel
// vers 5 minutes, avant d'atteindre ce bloc (constaté le 2026-10-17 et encore
// le 2026-11-01 : 0 envoi en base, Krusty bloqué depuis le 5 octobre).
//
// Une relance par restaurateur (tous ses établissements dans le même
// e-mail), toujours à 11 h (Bruxelles). Cadence décidée par Mehdi le
// 2026-11-01 : J+2, J+7, J+14 après l'inscription, puis toutes les deux
// semaines, six relances au plus. Les écarts se comptent depuis la relance
// PRÉCÉDENTE : un inscrit ancien (Krusty) ne reçoit pas un rattrapage en rafale.
// Dès la 3e relance sans effet, le cas est aussi signalé à l'équipe (appel ou
// WhatsApp de Mehdi).

/** Délai avant la 1re relance : on laisse le temps de finir seul. */
export const ONBOARDING_STUCK_HOURS = 48;
/** Écart minimum (en jours) avant la relance n+2, après la relance n+1 : J+2 → J+7 → J+14 → toutes les 2 semaines. */
export const GAP_DAYS_AFTER = [5, 7] as const;
export const LATER_GAP_DAYS = 14;
export const MAX_REMINDERS = 6;
/** À partir de ce nombre de relances sans effet, le cas est signalé à l'équipe. */
export const ESCALATE_FROM = 3;
/** Heure de Bruxelles de chaque relance. */
export const REMINDER_HOUR = 11;

export type OwnerOnboardingFacts = {
  /** Création du plus ancien établissement encore incomplet. */
  oldestIncompleteCreatedAt: Date | null;
  /** Relances déjà parties (statut « sent »), de la plus ancienne à la plus récente. */
  sentAt: Date[];
  /** Le journal des envois a pu être lu ; sinon on n'envoie rien (pas de doublon à l'aveugle). */
  journalAvailable: boolean;
};

export type OnboardingDecision =
  | { action: "send"; step: number; last: boolean; escalate: boolean }
  | { action: "wait"; reason: "too_early" | "not_the_hour" | "gap" | "journal_unavailable"; escalate: boolean }
  | { action: "capped"; escalate: true }
  | { action: "complete" };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Jours minimum entre la relance n° `sent` et la suivante. */
export function gapDaysAfter(sent: number): number {
  return GAP_DAYS_AFTER[sent - 1] ?? LATER_GAP_DAYS;
}

export function decideOnboardingReminder(f: OwnerOnboardingFacts, now: Date, brusselsHour: number): OnboardingDecision {
  if (!f.oldestIncompleteCreatedAt) return { action: "complete" };
  const count = f.sentAt.length;
  const escalate = count >= ESCALATE_FROM;
  if (!f.journalAvailable) return { action: "wait", reason: "journal_unavailable", escalate };
  if (count >= MAX_REMINDERS) return { action: "capped", escalate: true };

  if (count === 0) {
    if (now.getTime() - f.oldestIncompleteCreatedAt.getTime() < ONBOARDING_STUCK_HOURS * HOUR) return { action: "wait", reason: "too_early", escalate };
  } else {
    // Marge d'une heure : la relance précédente est partie à 11 h passées de quelques secondes.
    const last = f.sentAt[count - 1];
    if (now.getTime() - last.getTime() < gapDaysAfter(count) * DAY - HOUR) return { action: "wait", reason: "gap", escalate };
  }
  if (brusselsHour !== REMINDER_HOUR) return { action: "wait", reason: "not_the_hour", escalate };
  const step = count + 1;
  return { action: "send", step, last: step === MAX_REMINDERS, escalate };
}

export function brusselsHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hourCycle: "h23" }).format(now));
}
