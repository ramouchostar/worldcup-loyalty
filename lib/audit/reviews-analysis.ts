// ADR 0069 §3 D — lecture chiffrée des avis : courbe mensuelle, point de
// bascule, réponses du propriétaire. Fonctions pures (testées), la lecture des
// thèmes par Claude vit ailleurs.

import type { StoredReview } from "./dataforseo";
import { responseLevel, type Level, type Trend } from "./signals";

export interface MonthPoint {
  month: string; // "2026-03"
  count: number;
  avg: number;
  /** Moyenne glissante sur 3 mois, pondérée par le nombre d'avis. */
  rolling3: number;
}

const monthOf = (iso: string) => iso.slice(0, 7);

export function monthlySeries(reviews: StoredReview[]): MonthPoint[] {
  const byMonth = new Map<string, { sum: number; n: number }>();
  for (const r of reviews) {
    if (!r.date || r.rating == null) continue;
    const m = monthOf(r.date);
    const cur = byMonth.get(m) ?? { sum: 0, n: 0 };
    cur.sum += r.rating;
    cur.n += 1;
    byMonth.set(m, cur);
  }
  const months = [...byMonth.keys()].sort();
  return months.map((m, i) => {
    const win = months.slice(Math.max(0, i - 2), i + 1).map((k) => byMonth.get(k)!);
    const s = win.reduce((a, b) => a + b.sum, 0);
    const n = win.reduce((a, b) => a + b.n, 0);
    const cur = byMonth.get(m)!;
    return { month: m, count: cur.n, avg: round2(cur.sum / cur.n), rolling3: round2(s / n) };
  });
}

export interface Breakpoint {
  month: string; // premier mois de la période « après »
  before: number;
  after: number;
  nBefore: number;
  nAfter: number;
}

export const BREAKPOINT_MIN_REVIEWS = 20;
export const BREAKPOINT_MIN_DELTA = 0.3;

/**
 * Le mois où la moyenne avant et la moyenne après diffèrent le plus, avec au
 * moins 20 avis de chaque côté. Sous 0,3 étoile d'écart : null (« pas de
 * bascule nette ») — on n'en invente pas.
 */
export function findBreakpoint(reviews: StoredReview[]): Breakpoint | null {
  const dated = reviews
    .filter((r): r is StoredReview & { date: string; rating: number } => !!r.date && r.rating != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (dated.length < BREAKPOINT_MIN_REVIEWS * 2) return null;

  const months = [...new Set(dated.map((r) => monthOf(r.date)))].sort();
  let best: Breakpoint | null = null;
  for (const m of months.slice(1)) {
    const before = dated.filter((r) => monthOf(r.date) < m);
    const after = dated.filter((r) => monthOf(r.date) >= m);
    if (before.length < BREAKPOINT_MIN_REVIEWS || after.length < BREAKPOINT_MIN_REVIEWS) continue;
    const b = mean(before.map((r) => r.rating));
    const a = mean(after.map((r) => r.rating));
    if (!best || Math.abs(a - b) > Math.abs(best.after - best.before)) {
      best = { month: m, before: round2(b), after: round2(a), nBefore: before.length, nAfter: after.length };
    }
  }
  return best && Math.abs(best.after - best.before) >= BREAKPOINT_MIN_DELTA ? best : null;
}

/** Tendance : les 90 derniers jours face aux 12 mois précédents. */
export function trendOf(reviews: StoredReview[], now = new Date()): Trend | null {
  const d90 = new Date(now.getTime() - 90 * 864e5).toISOString();
  const d455 = new Date(now.getTime() - 455 * 864e5).toISOString();
  const recent = reviews.filter((r) => r.date && r.rating != null && r.date >= d90).map((r) => r.rating!);
  const prior = reviews.filter((r) => r.date && r.rating != null && r.date < d90 && r.date >= d455).map((r) => r.rating!);
  if (recent.length < 5 || prior.length < 10) return null;
  const delta = mean(recent) - mean(prior);
  if (delta <= -0.2) return "baisse";
  if (delta >= 0.2) return "hausse";
  return "stable";
}

export interface OwnerResponses {
  /** Part des avis des 12 derniers mois avec une réponse. */
  share: number | null;
  level: Level | null;
  /** Délai médian de réponse, en jours. */
  medianDelayDays: number | null;
  /** Part des avis 1–2★ des 12 derniers mois avec une réponse. */
  negativeShare: number | null;
}

export function ownerResponses(reviews: StoredReview[], now = new Date()): OwnerResponses {
  const since = new Date(now.getTime() - 365 * 864e5).toISOString();
  const year = reviews.filter((r) => r.date && r.date >= since);
  if (year.length === 0) return { share: null, level: null, medianDelayDays: null, negativeShare: null };
  const answered = year.filter((r) => r.ownerAnswer);
  const neg = year.filter((r) => r.rating != null && r.rating <= 2);
  const delays = answered
    .filter((r) => r.ownerAnswerDate)
    .map((r) => (Date.parse(r.ownerAnswerDate!) - Date.parse(r.date!)) / 864e5)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const share = answered.length / year.length;
  return {
    share: round2(share),
    level: responseLevel(share),
    medianDelayDays: delays.length ? round2(delays[Math.floor(delays.length / 2)]) : null,
    negativeShare: neg.length ? round2(neg.filter((r) => r.ownerAnswer).length / neg.length) : null,
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round2 = (n: number) => Math.round(n * 100) / 100;
