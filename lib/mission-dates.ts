// ============================================================
// Réserver un prestataire (ADR 0084 §5) — le calendrier du tournage.
//
// Le prestataire bloque ses jours ; le restaurateur choisit une date PARMI LES
// JOURS LIBRES, au moins 7 jours après le jour où il la choisit, avec un
// créneau conseillé. Ce fichier dit quel jour est libre, pourquoi un jour ne
// l'est pas, et si un choix tient. Fonctions PURES : le jour belge est injecté.
// ============================================================

import { addDays } from "./console-journey";
import { SHOOT_MIN_DAYS, earliestShootDate, shootSlots, type ShootSlot } from "./mission-brief";

/** Jusqu'où le calendrier s'étend : 12 semaines — au-delà, personne ne sait ce qu'il fera. */
export const CALENDAR_HORIZON_DAYS = 84;

export type DayState = "free" | "too_soon" | "unavailable" | "booked" | "past";

export type CalendarDay = {
  date: string;
  /** 0 = lundi … 6 = dimanche */
  weekday: number;
  state: DayState;
  /** Le jour est-il conseillé (calme) ? Mardi à jeudi : le service est le plus calme. */
  calm: boolean;
};

function weekdayOf(dateISO: string): number {
  const d = new Date(`${dateISO}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return (d + 6) % 7;
}

/** Les jours qui ne laissent PAS tourner : bloqués par le prestataire ou déjà pris par une autre mission. */
export type Blocked = { unavailable: ReadonlySet<string>; booked: ReadonlySet<string> };

export function dayState(date: string, today: string, blocked: Blocked): DayState {
  if (date < today) return "past";
  if (blocked.booked.has(date)) return "booked";
  if (blocked.unavailable.has(date)) return "unavailable";
  if (date < earliestShootDate(today)) return "too_soon";
  return "free";
}

/** Les semaines à afficher : du lundi de la semaine en cours jusqu'à l'horizon. */
export function buildCalendar(today: string, blocked: Blocked, horizonDays: number = CALENDAR_HORIZON_DAYS): CalendarDay[] {
  const start = addDays(today, -weekdayOf(today));
  const end = addDays(today, horizonDays);
  const out: CalendarDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const weekday = weekdayOf(d);
    out.push({ date: d, weekday, state: dayState(d, today, blocked), calm: weekday >= 1 && weekday <= 3 });
  }
  return out;
}

/** Ce que voit le PRESTATAIRE : il peut bloquer demain, même si un restaurateur ne pourra pas réserver avant 7 jours. */
export type ProviderDayState = "free" | "unavailable" | "booked" | "past";

export function providerDayState(date: string, today: string, blocked: Blocked): ProviderDayState {
  if (date < today) return "past";
  if (blocked.booked.has(date)) return "booked";
  if (blocked.unavailable.has(date)) return "unavailable";
  return "free";
}

export function buildProviderCalendar(today: string, blocked: Blocked, horizonDays: number = CALENDAR_HORIZON_DAYS): { date: string; weekday: number; state: ProviderDayState }[] {
  const start = addDays(today, -weekdayOf(today));
  const out: { date: string; weekday: number; state: ProviderDayState }[] = [];
  for (let d = start; d <= addDays(today, horizonDays); d = addDays(d, 1)) out.push({ date: d, weekday: weekdayOf(d), state: providerDayState(d, today, blocked) });
  return out;
}

export type ShootChoiceIssue = "date_invalid" | "past" | "too_soon" | "too_far" | "unavailable" | "booked" | "slot_unknown";

export type ShootChoiceVerdict = { ok: true; slot: ShootSlot } | { ok: false; issue: ShootChoiceIssue };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Le choix du restaurateur tient-il ? Un créneau déconseillé reste PERMIS (c'est son restaurant, il sait) :
 * l'écran l'avertit, la règle ne le refuse pas. Un jour bloqué ou déjà pris, jamais.
 */
export function judgeShootChoice(input: { date: string; slotStart: string; today: string; blocked: Blocked }): ShootChoiceVerdict {
  const { date, slotStart, today, blocked } = input;
  if (!ISO_DAY.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) return { ok: false, issue: "date_invalid" };
  if (date > addDays(today, CALENDAR_HORIZON_DAYS)) return { ok: false, issue: "too_far" };
  const state = dayState(date, today, blocked);
  if (state === "past") return { ok: false, issue: "past" };
  if (state === "booked") return { ok: false, issue: "booked" };
  if (state === "unavailable") return { ok: false, issue: "unavailable" };
  if (state === "too_soon") return { ok: false, issue: "too_soon" };
  const slot = shootSlots(date).find((s) => s.start === slotStart);
  if (!slot) return { ok: false, issue: "slot_unknown" };
  return { ok: true, slot };
}

const ISSUE_TEXT: Record<ShootChoiceIssue, string> = {
  date_invalid: "Choisis une date dans le calendrier.",
  past: "Cette date est passée.",
  too_soon: `Il faut ${SHOOT_MIN_DAYS} jours pour prévenir ton équipe : choisis une date plus tard.`,
  too_far: "Cette date est trop loin : choisis-en une dans les 12 prochaines semaines.",
  unavailable: "Le prestataire n'est pas disponible ce jour-là.",
  booked: "Ce jour vient d'être réservé par quelqu'un d'autre : choisis-en un autre.",
  slot_unknown: "Choisis un des créneaux proposés.",
};

export function shootChoiceMessage(issue: ShootChoiceIssue): string {
  return ISSUE_TEXT[issue];
}

// ── Disponibilités du prestataire ────────────────────────────

/** Jours que le prestataire peut bloquer ou libérer : à partir d'aujourd'hui, dans l'horizon. */
export function judgeDayEdit(days: readonly string[], today: string): { ok: true; days: string[] } | { ok: false; issue: "empty" | "too_many" | "invalid" | "out_of_range" } {
  if (days.length === 0) return { ok: false, issue: "empty" };
  if (days.length > 100) return { ok: false, issue: "too_many" };
  const unique = [...new Set(days)];
  for (const d of unique) {
    if (typeof d !== "string" || !ISO_DAY.test(d) || Number.isNaN(Date.parse(`${d}T12:00:00Z`))) return { ok: false, issue: "invalid" };
    if (d < today || d > addDays(today, CALENDAR_HORIZON_DAYS)) return { ok: false, issue: "out_of_range" };
  }
  return { ok: true, days: unique.sort() };
}

/**
 * Bloquer un jour déjà RÉSERVÉ par une mission n'a pas de sens : le jour est pris, le restaurateur compte dessus.
 * Le prestataire qui ne peut plus venir annule la mission (pénalité), il ne « bloque » pas.
 */
export function blockableDays(days: readonly string[], booked: ReadonlySet<string>): { blockable: string[]; refused: string[] } {
  return { blockable: days.filter((d) => !booked.has(d)), refused: days.filter((d) => booked.has(d)) };
}

// ── Préparation de l'équipe ──────────────────────────────────

/** Le restaurateur doit prévenir son équipe au moins 7 jours avant : où en est-il ? */
export type TeamNoticeState = "notified" | "due" | "late" | "early";

export function teamNoticeState(shootDate: string, today: string, notified: boolean): TeamNoticeState {
  if (notified) return "notified";
  const j7 = addDays(shootDate, -SHOOT_MIN_DAYS);
  if (today < j7) return "early";
  // Le jour même du J-7, c'est le moment ; après, l'équipe est prévenue trop tard (les étudiants ne travaillent pas toute la semaine).
  return today === j7 ? "due" : "late";
}
