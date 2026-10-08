// ============================================================
// Suivi du chiffre d'affaires jour par jour dans la console (ADR 0081 §7).
//
// Dès que le CA du jour est noté (ADR 0078 : saisi par l'équipe dans
// /platform/ca pendant le test, ou importé en CSV), un établissement en
// Croissance ou en Pro le suit sur son accueil, SANS attendre les 28 jours du
// départ des paliers : le dernier jour face aux mêmes jours de la semaine, la
// semaine en cours, les 14 derniers jours, et la part de son CA qui passe par
// le programme (tickets photographiés ÷ caisse).
//
// Fonctions PURES, date injectée. Surface restaurateur uniquement : jamais un
// euro côté membre (ADR 0007).
// ============================================================

import { addDays } from "./console-journey";

/** Un jour de caisse : un montant, ou fermé, ou rien de noté (absent). */
export type RevenueDay = { day: string; amount: number | null; closed: boolean; tickets: number | null };

/** CA et tickets des clients du programme (commandes validées), par jour. */
export type ProgramDay = { amount: number; tickets: number };

export const TRACK_DAYS = 14;
/** Comparaison aux N derniers mêmes jours de la semaine. */
export const SAME_WEEKDAYS = 4;

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const LETTERS = ["D", "L", "M", "M", "J", "V", "S"];
const wd = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const round2 = (n: number) => Math.round(n * 100) / 100;

export type TrackerCell = {
  day: string;
  letter: string;
  amount: number | null;
  closed: boolean;
  isLast: boolean;
};

export type RevenueTracker = {
  last: {
    day: string;
    weekday: string;
    amount: number;
    /** Moyenne des mêmes jours de la semaine déjà notés (jusqu'à 4). */
    sameAvg: number | null;
    sameCount: number;
    /** Écart en % face à cette moyenne (arrondi). */
    deltaPct: number | null;
    tickets: number | null;
    avgTicket: number | null;
  } | null;
  week: {
    /** Lundi → dimanche entièrement passés : on parle de « la semaine dernière ». */
    complete: boolean;
    total: number;
    days: number;
    /** Même période de la semaine d'avant, seulement si elle est notée en entier. */
    prevTotal: number | null;
    deltaPct: number | null;
  } | null;
  cells: TrackerCell[];
  /** Part du CA des jours notés qui vient des clients du programme. */
  program: {
    revenue: number;
    total: number;
    sharePct: number;
    /** Tickets du programme ÷ tickets de caisse, si la caisse donne ses tickets. */
    captureRatePct: number | null;
  } | null;
  notedDays: number;
};

const pct = (a: number, b: number) => Math.round((a / b - 1) * 100);

export function buildRevenueTracker(input: {
  today: string;
  days: RevenueDay[];
  program: Record<string, ProgramDay>;
}): RevenueTracker {
  const byDay = new Map(input.days.filter((d) => d.day < input.today).map((d) => [d.day, d]));
  const amountOn = (day: string) => {
    const d = byDay.get(day);
    return d && !d.closed && d.amount !== null ? d.amount : null;
  };
  const noted = [...byDay.values()].filter((d) => !d.closed && d.amount !== null).sort((a, b) => (a.day < b.day ? -1 : 1));

  // Le dernier jour noté, face aux mêmes jours de la semaine d'avant.
  let last: RevenueTracker["last"] = null;
  const lastDay = noted[noted.length - 1];
  if (lastDay && lastDay.amount !== null) {
    const same = noted
      .filter((d) => d.day < lastDay.day && wd(d.day) === wd(lastDay.day))
      .slice(-SAME_WEEKDAYS);
    const sameAvg = same.length ? round2(same.reduce((s, d) => s + (d.amount as number), 0) / same.length) : null;
    last = {
      day: lastDay.day,
      weekday: WEEKDAYS[wd(lastDay.day)],
      amount: lastDay.amount,
      sameAvg,
      sameCount: same.length,
      deltaPct: sameAvg ? pct(lastDay.amount, sameAvg) : null,
      tickets: lastDay.tickets,
      avgTicket: lastDay.tickets && lastDay.tickets > 0 ? round2(lastDay.amount / lastDay.tickets) : null,
    };
  }

  // La semaine en cours (du lundi à hier), face à la même période d'avant.
  let week: RevenueTracker["week"] = null;
  const yesterday = addDays(input.today, -1);
  const back = (wd(yesterday) + 6) % 7; // jours depuis lundi
  const monday = addDays(yesterday, -back);
  {
    let total = 0;
    let days = 0;
    let prevTotal = 0;
    let prevComplete = true;
    for (let i = 0; i <= back; i++) {
      const a = amountOn(addDays(monday, i));
      if (a !== null) {
        total += a;
        days += 1;
      }
      const prevDay = byDay.get(addDays(monday, i - 7));
      if (!prevDay) prevComplete = false;
      else if (!prevDay.closed && prevDay.amount !== null) prevTotal += prevDay.amount;
    }
    if (days > 0) {
      const prev = prevComplete && prevTotal > 0 ? round2(prevTotal) : null;
      week = { complete: back === 6, total: round2(total), days, prevTotal: prev, deltaPct: prev ? pct(total, prev) : null };
    }
  }

  // Les 14 derniers jours (jusqu'à hier).
  const cells: TrackerCell[] = Array.from({ length: TRACK_DAYS }, (_, i) => {
    const day = addDays(yesterday, i - (TRACK_DAYS - 1));
    const d = byDay.get(day);
    return {
      day,
      letter: LETTERS[wd(day)],
      amount: d && !d.closed ? d.amount : null,
      closed: !!d?.closed,
      isLast: day === lastDay?.day,
    };
  });

  // La part du programme, sur les jours notés de la période affichée.
  let program: RevenueTracker["program"] = null;
  const window = cells.filter((c) => c.amount !== null);
  const total = window.reduce((s, c) => s + (c.amount as number), 0);
  if (total > 0) {
    const revenue = window.reduce((s, c) => s + (input.program[c.day]?.amount ?? 0), 0);
    const withTickets = window.filter((c) => (byDay.get(c.day)?.tickets ?? 0) > 0);
    const cashTickets = withTickets.reduce((s, c) => s + (byDay.get(c.day)?.tickets ?? 0), 0);
    const progTickets = withTickets.reduce((s, c) => s + (input.program[c.day]?.tickets ?? 0), 0);
    program = {
      revenue: round2(revenue),
      total: round2(total),
      sharePct: Math.round((revenue / total) * 100),
      captureRatePct: cashTickets > 0 ? Math.round((progTickets / cashTickets) * 100) : null,
    };
  }

  return { last, week, cells, program, notedDays: noted.length };
}
