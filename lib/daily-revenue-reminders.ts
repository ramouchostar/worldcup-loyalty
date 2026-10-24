// ADR 0087 §4 — les rappels du CA du jour : règles PURES (aucune base, aucune
// horloge — le jour et l'heure de Bruxelles sont injectés), testées dans
// daily-revenue-reminders.test.ts.
//
// Pour un jour de ventes D, quatre rappels au plus, et aucun dès que D est noté :
//   soir  30 min après la fermeture de D (fiche Google ; 23 h 30 sans horaires),
//         jusqu'à 6 h le lendemain — une fermeture à 2 h donne un rappel à 2 h 30 ;
//   10 h, 15 h, 18 h  le lendemain de D.
// Le dimanche à 15 h : les jours manquants de la semaine (lundi → samedi).
// Un jour où la fiche dit « fermé » ne se réclame jamais.

import { addDays, dayLabel, weekdayName } from "@/lib/daily-revenue-model";

/** Clé du catalogue (lib/message-catalog.ts) et de l'interrupteur par établissement. */
export const CA_REMINDER_KEY = "ca_du_jour";

export type ReminderSlot = "soir" | "10h" | "15h" | "18h" | "semaine";

/**
 * Heure de fermeture par jour de la semaine (0 = dimanche, comme Date.getUTCDay),
 * en minutes depuis le début du jour d'ouverture (au-delà de 1440 : après minuit).
 * `null` pour un jour = fermé ce jour-là. La valeur entière `null` = horaires inconnus.
 */
export type ClosingTimes = (number | null)[];

export const DEFAULT_CLOSING_MIN = 23 * 60 + 30;
export const EVENING_DELAY_MIN = 30;
/** Le rappel du soir ne part plus après 6 h : la journée suivante a ses propres rappels. */
const EVENING_LAST_MIN = 24 * 60 + 6 * 60;
const DAY_SLOTS: { slot: ReminderSlot; at: number }[] = [
  { slot: "10h", at: 10 * 60 },
  { slot: "15h", at: 15 * 60 },
  { slot: "18h", at: 18 * 60 },
];
const WEEKLY_AT_MIN = 15 * 60;

function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

// ── Les horaires de la fiche Google (Places API, regularOpeningHours.periods) ─

type PlacePoint = { day?: number; hour?: number; minute?: number };
export type PlacePeriod = { open?: PlacePoint; close?: PlacePoint };

/**
 * La dernière fermeture de chaque jour d'ouverture. Une période sans fermeture
 * (ouvert 24 h/24) ou aucune période : horaires inconnus → `null`.
 */
export function closingFromPeriods(periods: PlacePeriod[] | null | undefined): ClosingTimes | null {
  if (!periods || periods.length === 0) return null;
  const out: ClosingTimes = [null, null, null, null, null, null, null];
  for (const p of periods) {
    const o = p.open;
    const c = p.close;
    if (!c || o?.day === undefined || c.day === undefined) return null;
    const span = ((c.day - o.day + 7) % 7) * 1440;
    const close = span + (c.hour ?? 0) * 60 + (c.minute ?? 0);
    const prev = out[o.day];
    out[o.day] = prev === null || close > prev ? close : prev;
  }
  return out;
}

/** `undefined` = horaires inconnus (heure par défaut) ; `null` = fermé ce jour-là. */
function closingFor(closing: ClosingTimes | null, day: string): number | null | undefined {
  if (!closing) return undefined;
  return closing[weekday(day)] ?? null;
}

// ── Qui doit partir maintenant ────────────────────────────────────────────────

export type PlanInput = {
  /** Jour de Bruxelles (AAAA-MM-JJ). */
  today: string;
  /** Minutes écoulées depuis minuit à Bruxelles. */
  nowMinutes: number;
  closing: ClosingTimes | null;
  /** Jours déjà notés : montant ou fermé, saisie ou ventes importées. */
  covered: Set<string>;
  /** Rappels déjà partis : `${jour}|${slot}`. */
  sent: Set<string>;
};

export type PlannedReminder = { slot: ReminderSlot; day: string; days?: string[] };

export function planReminders(input: PlanInput): PlannedReminder[] {
  const { today, nowMinutes, closing, covered, sent } = input;
  const yesterday = addDays(today, -1);
  const out: PlannedReminder[] = [];
  const isClosedDay = (d: string) => closingFor(closing, d) === null;

  // Le soir : pour aujourd'hui, ou pour hier quand la fermeture passe minuit.
  for (const [day, offset] of [[yesterday, 1440], [today, 0]] as const) {
    if (covered.has(day) || isClosedDay(day) || sent.has(`${day}|soir`)) continue;
    const close = closingFor(closing, day) ?? DEFAULT_CLOSING_MIN;
    const now = offset + nowMinutes;
    if (now >= close + EVENING_DELAY_MIN && now < EVENING_LAST_MIN) out.push({ slot: "soir", day });
  }

  // Le lendemain : le dernier créneau échu seulement (une tâche en retard ne rattrape pas les précédents).
  if (!covered.has(yesterday) && !isClosedDay(yesterday)) {
    const due = DAY_SLOTS.filter((s) => nowMinutes >= s.at);
    const last = due[due.length - 1];
    if (last && !sent.has(`${yesterday}|${last.slot}`)) out.push({ slot: last.slot, day: yesterday });
  }

  // Le dimanche à 15 h : les jours de la semaine encore vides.
  if (weekday(today) === 0 && nowMinutes >= WEEKLY_AT_MIN && !sent.has(`${today}|semaine`)) {
    const days = Array.from({ length: 6 }, (_, i) => addDays(today, i - 6)).filter((d) => !covered.has(d) && !isClosedDay(d));
    if (days.length > 0) out.push({ slot: "semaine", day: today, days });
  }
  return out;
}

// ── Les textes (validés par le porteur le 2026-10-24) ─────────────────────────

export type ReminderText = { title: string; body: string; subject: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function reminderText(r: PlannedReminder): ReminderText {
  const full = dayLabel(r.day); // « vendredi 23 octobre »
  switch (r.slot) {
    case "soir":
      return {
        title: "Ton CA de ce soir ?",
        body: "Note le chiffre du jour, ça prend 30 secondes. C'est lui qui permet de suivre ta semaine.",
        subject: `Ton CA du ${full}`,
      };
    case "10h":
      return {
        title: "Ton CA d'hier n'est pas noté",
        body: "Sans ce chiffre, pas de comparaison ni de prévision. Appuie pour le saisir.",
        subject: `Il manque ton CA du ${full}`,
      };
    case "15h":
      return {
        title: "Il manque toujours ton CA d'hier",
        body: "Ça prend 30 secondes, et ta semaine reste complète.",
        subject: `Il manque toujours ton CA du ${full}`,
      };
    case "18h":
      return {
        title: "Dernier rappel pour ton CA d'hier",
        body: "Note-le avant le service du soir. Après, on n'insiste plus.",
        subject: `Dernier rappel : ton CA du ${full}`,
      };
    case "semaine": {
      const n = r.days?.length ?? 0;
      const names = (r.days ?? []).map((d) => weekdayName(d));
      return {
        title: `Ta semaine : ${n} jour${n > 1 ? "s" : ""} à compléter`,
        body: `${cap(names.join(", "))} : complète-les pour que ta comparaison de lundi soit juste.`,
        subject: `Ta semaine : ${n} jour${n > 1 ? "s" : ""} à compléter`,
      };
    }
  }
}

/** Le jour que le lien ouvre : le jour du rappel, ou le plus ancien jour manquant de la semaine. */
export function reminderTargetDay(r: PlannedReminder): string {
  return r.slot === "semaine" && r.days?.length ? r.days[0] : r.day;
}
