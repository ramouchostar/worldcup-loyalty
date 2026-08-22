// Granularité d'un rapport de ventes (ADR 0027, assouplissement 2026-08-22).
//
// Chaque logiciel de caisse exporte à sa façon : une ligne par ticket, un
// total par jour, par semaine ou par mois. On ne demande plus au restaurateur
// de se plier à un format : on DÉTECTE ce qu'il a déposé (écart médian entre
// dates distinctes) et le moteur s'adapte — prévision jour par jour si on a le
// détail journalier, lecture de tendance sinon. Pur, sans dépendance : testé.

export type Granularity = "daily" | "weekly" | "monthly" | "unknown";

export type GranularityInfo = {
  kind: Granularity;
  periods: number;        // nb de dates distinctes (jours / semaines / mois)
  firstDate: string | null;
  lastDate: string | null;
  label: string;          // « 92 jours de ventes », « 13 semaines (totaux hebdo) »…
};

const DAY = 86_400_000;
const ms = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getTime();

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectGranularity(dates: string[]): GranularityInfo {
  const distinct = Array.from(new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort();
  if (distinct.length === 0) return { kind: "unknown", periods: 0, firstDate: null, lastDate: null, label: "aucune date reconnue" };
  if (distinct.length === 1) return { kind: "unknown", periods: 1, firstDate: distinct[0], lastDate: distinct[0], label: "une seule date" };

  const gaps: number[] = [];
  for (let i = 1; i < distinct.length; i++) gaps.push((ms(distinct[i]) - ms(distinct[i - 1])) / DAY);
  const g = median(gaps);

  let kind: Granularity = "unknown";
  if (g <= 1.5) kind = "daily";
  else if (g >= 6 && g <= 8) kind = "weekly";
  else if (g >= 27 && g <= 32) kind = "monthly";

  const n = distinct.length;
  const label =
    kind === "daily" ? `${n} jour${n > 1 ? "s" : ""} de ventes`
    : kind === "weekly" ? `${n} semaine${n > 1 ? "s" : ""} (totaux hebdomadaires)`
    : kind === "monthly" ? `${n} mois (totaux mensuels)`
    : `${n} dates à intervalle irrégulier`;

  return { kind, periods: n, firstDate: distinct[0], lastDate: distinct[n - 1], label };
}

// Lecture de tendance pour un rapport NON journalier (totaux hebdo / mensuels) :
// niveau moyen des dernières périodes, dernière vs précédente, direction.
export type Trend = {
  periodLabel: "semaine" | "mois";
  periods: number;
  avgRecent: number;      // moyenne des 4 dernières périodes (ou moins)
  last: number | null;
  previous: number | null;
  changePct: number | null; // (last − previous) / previous
  direction: "up" | "down" | "flat" | "na";
};

export function summarizeTrend(rows: { sold_on: string; amount: number }[], kind: "weekly" | "monthly"): Trend {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.sold_on, (byDate.get(r.sold_on) ?? 0) + Number(r.amount));
  const dates = Array.from(byDate.keys()).sort();
  const totals = dates.map((d) => byDate.get(d)!);
  const recent = totals.slice(-4);
  const avgRecent = recent.length ? recent.reduce((s, x) => s + x, 0) / recent.length : 0;
  const last = totals.length ? totals[totals.length - 1] : null;
  const previous = totals.length > 1 ? totals[totals.length - 2] : null;
  const changePct = last !== null && previous ? (last - previous) / previous : null;
  const direction: Trend["direction"] =
    changePct === null ? "na" : changePct > 0.03 ? "up" : changePct < -0.03 ? "down" : "flat";
  return { periodLabel: kind === "weekly" ? "semaine" : "mois", periods: dates.length, avgRecent, last, previous, changePct, direction };
}
