// Relance d'inscription restaurateur — règles pures, testées dans
// lib/onboarding-reminder-rules.test.ts. Remplace le bloc de fin du cron de
// notifications, qui n'a jamais rien envoyé : le cron est coupé par Vercel
// vers 5 minutes, avant d'atteindre ce bloc (constaté le 2026-10-17 :
// 0 envoi en base, Krusty bloqué depuis 12 jours).
//
// Une relance par restaurateur (tous ses établissements dans le même
// e-mail), deux au plus : la 1re à 11 h, la 2de à 19 h au moins un jour plus
// tard. Après la 2de, plus d'e-mail : le cas passe à l'équipe (Field
// management) s'il n'a pas bougé 48 h après.

/** Délai avant la 1re relance : on laisse le temps de finir seul. */
export const ONBOARDING_STUCK_HOURS = 48;
/** Écart minimum entre la 1re et la 2de relance. */
export const SECOND_REMINDER_MIN_GAP_HOURS = 24;
/** Silence après la 2de relance avant de signaler le cas à l'équipe. */
export const ESCALATE_AFTER_HOURS = 48;
export const MAX_REMINDERS = 2;
/** Heure de Bruxelles de chaque relance (1re, 2de). */
export const REMINDER_HOURS: Record<1 | 2, number> = { 1: 11, 2: 19 };

export type OwnerOnboardingFacts = {
  /** Création du plus ancien établissement encore incomplet. */
  oldestIncompleteCreatedAt: Date | null;
  /** Relances déjà parties (statut « sent »), de la plus ancienne à la plus récente. */
  sentAt: Date[];
  /** Le journal des envois a pu être lu ; sinon on n'envoie rien (pas de doublon à l'aveugle). */
  journalAvailable: boolean;
};

export type OnboardingDecision =
  | { action: "send"; step: 1 | 2 }
  | { action: "wait"; reason: "too_early" | "not_the_hour" | "gap" | "journal_unavailable" }
  | { action: "escalate" }
  | { action: "capped" }
  | { action: "complete" };

const HOUR = 3_600_000;

export function decideOnboardingReminder(f: OwnerOnboardingFacts, now: Date, brusselsHour: number): OnboardingDecision {
  if (!f.oldestIncompleteCreatedAt) return { action: "complete" };
  if (!f.journalAvailable) return { action: "wait", reason: "journal_unavailable" };

  const count = f.sentAt.length;
  if (count >= MAX_REMINDERS) {
    const last = f.sentAt[count - 1];
    return now.getTime() - last.getTime() >= ESCALATE_AFTER_HOURS * HOUR ? { action: "escalate" } : { action: "capped" };
  }

  if (now.getTime() - f.oldestIncompleteCreatedAt.getTime() < ONBOARDING_STUCK_HOURS * HOUR) {
    return { action: "wait", reason: "too_early" };
  }

  const step = (count + 1) as 1 | 2;
  if (step === 2 && now.getTime() - f.sentAt[0].getTime() < SECOND_REMINDER_MIN_GAP_HOURS * HOUR) {
    return { action: "wait", reason: "gap" };
  }
  if (brusselsHour !== REMINDER_HOURS[step]) return { action: "wait", reason: "not_the_hour" };
  return { action: "send", step };
}

export function brusselsHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hourCycle: "h23" }).format(now));
}
