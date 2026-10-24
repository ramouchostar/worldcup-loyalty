// ADR 0087 §5 — la performance semaine après semaine, sur l'accueil, dès 14
// jours notés ; la prévision des 7 prochains jours dès 28. Règles PURES, date
// injectée, testées dans revenue-weeks.test.ts.
//
// Une semaine se lit en CA MOYEN PAR JOUR NOTÉ, pas en total : une semaine
// trouée (deux jours oubliés) aurait l'air d'un effondrement. Elle ne compte
// qu'avec au moins 3 jours notés (même règle que les paliers, ADR 0081 §2).

import { addDays } from "./daily-revenue-model";
import type { RevenueDay } from "./revenue-tracker";

export const CHART_MIN_NOTED_DAYS = 14;
export const FORECAST_MIN_NOTED_DAYS = 28;
export const MAX_WEEKS = 8;
const MIN_DAYS_PER_WEEK = 3;

export type WeekPoint = {
  /** Lundi de la semaine (AAAA-MM-JJ). */
  monday: string;
  avgPerDay: number;
  total: number;
  noted: number;
  closed: number;
  /** Écart du CA moyen par jour face à la semaine précédente gardée (si elle est la semaine juste avant). */
  deltaPct: number | null;
};

export type WeeksView = { notedDays: number; weeks: WeekPoint[] };

function mondayOf(day: string): string {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((wd + 6) % 7));
}

/** Jours avec un montant (fermés exclus). */
export function countNotedDays(days: RevenueDay[]): number {
  return days.filter((d) => !d.closed && d.amount !== null).length;
}

/** Les semaines entièrement passées (lundi → dimanche avant aujourd'hui), les plus anciennes d'abord. */
export function weeklyPerformance(days: RevenueDay[], today: string, maxWeeks = MAX_WEEKS): WeeksView {
  const thisMonday = mondayOf(today);
  const byWeek = new Map<string, { total: number; noted: number; closed: number }>();
  for (const d of days) {
    const m = mondayOf(d.day);
    if (m >= thisMonday) continue; // semaine en cours : pas encore finie
    const w = byWeek.get(m) ?? { total: 0, noted: 0, closed: 0 };
    if (d.closed) w.closed++;
    else if (d.amount !== null) {
      w.total += d.amount;
      w.noted++;
    }
    byWeek.set(m, w);
  }
  const kept = [...byWeek.entries()]
    .filter(([, w]) => w.noted >= MIN_DAYS_PER_WEEK)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-maxWeeks);

  const weeks: WeekPoint[] = [];
  for (const [monday, w] of kept) {
    const avgPerDay = Math.round(w.total / w.noted);
    const prev = weeks[weeks.length - 1];
    const consecutive = prev && addDays(prev.monday, 7) === monday;
    weeks.push({
      monday,
      avgPerDay,
      total: Math.round(w.total),
      noted: w.noted,
      closed: w.closed,
      deltaPct: consecutive && prev.avgPerDay > 0 ? Math.round((avgPerDay / prev.avgPerDay - 1) * 100) : null,
    });
  }
  return { notedDays: countNotedDays(days), weeks };
}
