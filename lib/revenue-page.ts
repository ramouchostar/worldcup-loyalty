// ============================================================
// La page « Chiffre d'affaires » de la console (ADR 0064 amendé, ADR 0103) —
// logique PURE : la date est injectée, chaque chiffre se recalcule à la main
// depuis les lignes sources. Testé dans revenue-page.test.ts.
//
// Maquette validée par Mehdi le 2026-11-15 :
// https://claude.ai/artifact/BpMKiqkWJ3DppGeXxX6dzE
//
// Règles tenues ici :
//   - un jour pas encore lu (Belpeople a une semaine de retard) n'est JAMAIS
//     zéro : tout part du dernier jour lu, et sa date est dite ;
//   - une comparaison se fait sur les MÊMES quantièmes du mois d'avant, réduits
//     aux jours lus (1er–8 nov. contre 1er–8 oct.), jamais sur des périodes
//     de longueurs différentes ;
//   - une remarque (Chloé) n'existe que si ses données existent ; aucune valeur
//     inventée, aucun « grâce à nous » ;
//   - la projection du mois = jours déjà lus + moyenne du même jour de semaine
//     (8 dernières semaines) pour chaque jour restant. Trace :
//     docs/mesures/suivi-projection-ca.sql (seuil : écart > 10 % au réel).
// Surface restaurateur uniquement : les euros y sont permis (ADR 0007 §admin).
// ============================================================

import { addDays } from "./console-journey";
import { inRange, type DayRange, type StatsPeriod } from "./stats-page";

/** Un jour de caisse : un montant, ou fermé, ou absent (pas lu, pas noté). */
export type CaDay = { day: string; amount: number | null; closed: boolean; tickets: number | null };

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const WD_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const LETTERS = ["D", "L", "M", "M", "J", "V", "S"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Lundi d'abord : l'ordre d'une semaine de restaurateur. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Moyennes par jour de semaine et grille horaire : 8 semaines avant le dernier jour lu. */
export const HISTORY_DAYS = 56;
/** Assez de jours lus des deux côtés pour comparer des moyennes par jour. */
export const MIN_TO_COMPARE = 5;
/** Un jour de semaine a une moyenne à partir de 2 jours lus. */
export const MIN_PER_WEEKDAY = 2;
/** Grille horaire montrée à partir de 14 dates lues. */
export const MIN_HOURLY_DATES = 14;
/** Projection du mois : 4 mêmes jours de semaine lus au moins, et ±8 % au moins sur la part estimée. */
export const MIN_WEEKS_TO_PROJECT = 4;
export const PROJECTION_MIN_MARGIN = 0.08;
/** Remarque « plateformes » à partir de 10 % des ventes. */
export const PLATFORM_TIP_PCT = 10;

export const wd = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const dnum = (day: string) => Number(day.slice(8, 10));
const mIdx = (day: string) => Number(day.slice(5, 7)) - 1;
const ord = (n: number) => (n === 1 ? "1er" : String(n));

/** « dimanche 8 novembre » (« 1er » le premier). */
export function longDay(day: string): string {
  return `${WEEKDAYS[wd(day)]} ${ord(dnum(day))} ${MONTHS[mIdx(day)]}`;
}
/** « dim. 8 nov. » */
export function shortDay(day: string): string {
  return `${WD_SHORT[wd(day)]} ${ord(dnum(day))} ${MONTHS_SHORT[mIdx(day)]}`;
}
/** « Lundi 16 nov. » */
export function listDay(day: string): string {
  const w = WEEKDAYS[wd(day)];
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${ord(dnum(day))} ${MONTHS_SHORT[mIdx(day)]}`;
}
export function weekdayName(w: number): string {
  return WEEKDAYS[w];
}
export function monthName(day: string): string {
  return MONTHS[mIdx(day)];
}
/** « du 1er au 8 novembre », « le 3 novembre », « du 28 octobre au 3 novembre ». */
export function rangeLabel(r: DayRange): string {
  if (r.from === r.to) return `le ${ord(dnum(r.from))} ${MONTHS[mIdx(r.from)]}`;
  if (r.from.slice(0, 7) === r.to.slice(0, 7)) return `du ${ord(dnum(r.from))} au ${ord(dnum(r.to))} ${MONTHS[mIdx(r.to)]}`;
  return `du ${ord(dnum(r.from))} ${MONTHS[mIdx(r.from)]} au ${ord(dnum(r.to))} ${MONTHS[mIdx(r.to)]}`;
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}
export function monthEnd(day: string): string {
  return addDays(monthStart(addDays(monthStart(day), 32)), -1);
}
function daysOf(r: DayRange): string[] {
  const out: string[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
  return out;
}

const isNoted = (d: CaDay | undefined): d is CaDay & { amount: number } => !!d && !d.closed && typeof d.amount === "number";

/** Arrondi lisible d'un montant : à 1 000 € au-delà de 20 000, à 100 € au-delà de 2 000, sinon à 10 €. */
export function roundMoney(n: number): number {
  const step = Math.abs(n) >= 20000 ? 1000 : Math.abs(n) >= 2000 ? 100 : 10;
  return Math.round(n / step) * step;
}

// ── Le dernier jour lu ───────────────────────────────────────────────────────

/** Le dernier jour connu (montant ou fermé) avant aujourd'hui. null : rien de lu. */
export function lastReadDay(days: CaDay[], today: string): string | null {
  let last: string | null = null;
  for (const d of days) {
    if (d.day >= today) continue;
    if (!(isNoted(d) || d.closed)) continue;
    if (!last || d.day > last) last = d.day;
  }
  return last;
}

/** La partie lue de la période : du début de la période au dernier jour lu. */
export function readWindow(period: Pick<StatsPeriod, "current">, lastRead: string | null): DayRange | null {
  if (!lastRead) return null;
  const to = lastRead < period.current.to ? lastRead : period.current.to;
  return to >= period.current.from ? { from: period.current.from, to } : null;
}

/** Les mêmes quantièmes du mois d'avant (le 31 → fin du mois d'avant). */
export function sameDaysPreviousMonth(r: DayRange): DayRange {
  const prevStart = monthStart(addDays(monthStart(r.from), -1));
  const prevEnd = monthEnd(prevStart);
  const clamp = (n: number) => {
    const d = `${prevStart.slice(0, 8)}${String(n).padStart(2, "0")}`;
    return d > prevEnd ? prevEnd : d;
  };
  return { from: clamp(dnum(r.from)), to: clamp(dnum(r.to)) };
}

// ── Résumé de la période ─────────────────────────────────────────────────────

export type CaSummary = {
  window: DayRange;
  total: number;
  notedDays: number;
  avgPerDay: number;
  /** Comparaison aux mêmes jours du mois d'avant, null sans assez de jours des deux côtés. */
  compare: { window: DayRange; avgPerDay: number; changePct: number } | null;
  /** Commandes et panier moyen : seulement si chaque jour lu connaît ses tickets. */
  orders: number | null;
  basket: number | null;
  /** Part du CA lu qui vient des tickets du programme (mêmes jours). */
  programSharePct: number | null;
  best: { day: string; amount: number } | null;
  calmest: { day: string; amount: number } | null;
};

export function caSummary(
  days: CaDay[],
  window: DayRange,
  program: Record<string, { amount: number }>,
  withCompare: boolean,
): CaSummary {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const noted = daysOf(window).map((d) => byDay.get(d)).filter(isNoted);
  const total = noted.reduce((s, d) => s + d.amount, 0);
  const avgPerDay = noted.length ? total / noted.length : 0;

  let compare: CaSummary["compare"] = null;
  if (withCompare && noted.length >= MIN_TO_COMPARE) {
    const prevWin = sameDaysPreviousMonth(window);
    const prev = daysOf(prevWin).map((d) => byDay.get(d)).filter(isNoted);
    const prevTotal = prev.reduce((s, d) => s + d.amount, 0);
    if (prev.length >= MIN_TO_COMPARE && prevTotal > 0) {
      const prevAvg = prevTotal / prev.length;
      compare = { window: prevWin, avgPerDay: prevAvg, changePct: Math.round(((avgPerDay - prevAvg) / prevAvg) * 100) };
    }
  }

  const allTickets = noted.length > 0 && noted.every((d) => typeof d.tickets === "number" && d.tickets > 0);
  const orders = allTickets ? noted.reduce((s, d) => s + (d.tickets as number), 0) : null;
  const basket = orders ? total / orders : null;

  const programOn = noted.reduce((s, d) => s + (program[d.day]?.amount ?? 0), 0);
  const programSharePct = total > 0 && noted.length >= MIN_TO_COMPARE ? Math.min(100, Math.round((programOn / total) * 100)) : null;

  let best: CaSummary["best"] = null;
  let calmest: CaSummary["calmest"] = null;
  for (const d of noted) {
    if (!best || d.amount > best.amount) best = { day: d.day, amount: d.amount };
    if (!calmest || d.amount < calmest.amount) calmest = { day: d.day, amount: d.amount };
  }
  if (noted.length < 2) calmest = null;

  return { window, total, notedDays: noted.length, avgPerDay, compare, orders, basket, programSharePct, best, calmest };
}

// ── Les barres de la période ─────────────────────────────────────────────────

export type CaBarStatus = "noted" | "closed" | "pending" | "missing";
export type CaBar = { day: string; letter: string; num: number; amount: number | null; status: CaBarStatus; best: boolean };

/**
 * Un jour par barre, de début de période à hier. « pending » = après le dernier
 * jour lu (la caisse ne l'a pas encore donné) ; « missing » = avant, sans rien.
 */
export function caBars(days: CaDay[], period: Pick<StatsPeriod, "current">, today: string, lastRead: string | null): CaBar[] {
  const yesterday = addDays(today, -1);
  const to = period.current.to < yesterday ? period.current.to : yesterday;
  if (to < period.current.from) return [];
  const byDay = new Map(days.map((d) => [d.day, d]));
  const bars = daysOf({ from: period.current.from, to }).map((day): CaBar => {
    const d = byDay.get(day);
    const status: CaBarStatus = isNoted(d) ? "noted" : d?.closed ? "closed" : lastRead && day > lastRead ? "pending" : "missing";
    return { day, letter: LETTERS[wd(day)], num: dnum(day), amount: isNoted(d) ? d.amount : null, status, best: false };
  });
  const max = Math.max(0, ...bars.map((b) => b.amount ?? 0));
  if (max > 0) for (const b of bars) b.best = b.amount === max;
  return bars;
}

// ── La semaine type ──────────────────────────────────────────────────────────

export type WeekdayAvg = { weekday: number; label: string; avg: number | null; n: number; closedShare: number };
export type WeekType = { range: DayRange; days: WeekdayAvg[]; best: WeekdayAvg | null; weakest: WeekdayAvg | null };

/** Moyenne par jour de semaine sur les 8 semaines qui finissent au dernier jour lu. */
export function weekType(days: CaDay[], lastRead: string | null): WeekType | null {
  if (!lastRead) return null;
  const range = { from: addDays(lastRead, -(HISTORY_DAYS - 1)), to: lastRead };
  const acc = new Map<number, { sum: number; n: number; closed: number }>();
  for (const d of days) {
    if (!inRange(d.day, range)) continue;
    const a = acc.get(wd(d.day)) ?? { sum: 0, n: 0, closed: 0 };
    if (isNoted(d)) {
      a.sum += d.amount;
      a.n += 1;
    } else if (d.closed) a.closed += 1;
    acc.set(wd(d.day), a);
  }
  const list = WEEK_ORDER.map((w): WeekdayAvg => {
    const a = acc.get(w) ?? { sum: 0, n: 0, closed: 0 };
    const label = WEEKDAYS[w].charAt(0).toUpperCase() + WEEKDAYS[w].slice(1);
    const seen = a.n + a.closed;
    return { weekday: w, label, avg: a.n >= MIN_PER_WEEKDAY ? a.sum / a.n : null, n: a.n, closedShare: seen ? a.closed / seen : 0 };
  });
  const open = list.filter((x) => x.avg !== null && x.closedShare < 0.5);
  if (open.length === 0) return null;
  const best = open.reduce((m, x) => ((x.avg as number) > (m.avg as number) ? x : m));
  const weakest = open.length >= 2 ? open.reduce((m, x) => ((x.avg as number) < (m.avg as number) ? x : m)) : null;
  return { range, days: list, best, weakest };
}

/** Écart moyen d'un jour à la moyenne de son jour de semaine (sert à la fourchette). */
function typicalError(days: CaDay[], wt: WeekType): number {
  const avg = new Map(wt.days.map((x) => [x.weekday, x.avg]));
  let sum = 0;
  let n = 0;
  for (const d of days) {
    if (!inRange(d.day, wt.range) || !isNoted(d)) continue;
    const a = avg.get(wd(d.day));
    if (!a) continue;
    sum += Math.abs(d.amount - a) / a;
    n += 1;
  }
  return n ? sum / n : 0.2;
}

/** Ce qu'un jour devrait faire d'après sa semaine type (fermé habituellement = 0). */
function expectedFor(day: string, wt: WeekType): number | null {
  const x = wt.days.find((w) => w.weekday === wd(day));
  if (!x) return null;
  if (x.closedShare >= 0.5) return 0;
  return x.avg;
}

// ── Combien tu vas faire ─────────────────────────────────────────────────────

export type MonthProjection = {
  month: string; // AAAA-MM-01
  name: string; // « novembre »
  expected: number;
  low: number;
  high: number;
  /** Déjà lu ce mois (0 pour le mois prochain). */
  readTotal: number;
  readDays: number;
  remainingDays: number;
  /** Jours fériés belges dans les jours estimés : la projection ne les connaît pas. */
  holidays: string[];
};

/**
 * Projection d'un mois : jours lus + semaine type pour chaque jour restant.
 * La fourchette s'applique à la part estimée seulement : ±3/4 de l'écart habituel
 * d'un jour, 8 % au moins. Calibrée le 2026-11-15 sur l'historique réel (projection
 * au 8 du mois contre le réel : −10 % à +12 % chez Kraainem, Houba et De Bue,
 * docs/mesures/suivi-projection-ca.sql). Sans 4 semaines lues pour chaque jour
 * ouvert, pas de projection : le premier mois d'un établissement se trompait de 20 %.
 */
export function projectMonth(
  days: CaDay[],
  month: string,
  lastRead: string,
  wt: WeekType,
  holidays: Set<string> = new Set(),
): MonthProjection | null {
  if (wt.days.some((x) => x.closedShare < 0.5 && x.n < MIN_WEEKS_TO_PROJECT)) return null;
  const from = monthStart(month);
  const to = monthEnd(month);
  const byDay = new Map(days.map((d) => [d.day, d]));
  let readTotal = 0;
  let readDays = 0;
  let estimated = 0;
  let remainingDays = 0;
  const hol: string[] = [];
  for (const day of daysOf({ from, to })) {
    const d = byDay.get(day);
    if (day <= lastRead && (isNoted(d) || d?.closed)) {
      readTotal += isNoted(d) ? d.amount : 0;
      readDays += 1;
      continue;
    }
    // Un jour passé jamais lu est estimé comme les jours à venir (jamais zéro).
    const e = expectedFor(day, wt);
    if (e === null) return null;
    estimated += e;
    remainingDays += 1;
    if (holidays.has(day)) hol.push(day);
  }
  const margin = Math.max(PROJECTION_MIN_MARGIN, typicalError(days, wt) * 0.75);
  const expected = readTotal + estimated;
  return {
    month: from,
    name: monthName(from),
    expected: roundMoney(expected),
    low: roundMoney(readTotal + estimated * (1 - margin)),
    high: roundMoney(readTotal + estimated * (1 + margin)),
    readTotal,
    readDays,
    remainingDays,
    holidays: hol,
  };
}

/** Le total réel d'un mois, s'il est lu à 90 % au moins (sinon on ne le cite pas). */
export function monthActual(days: CaDay[], month: string): number | null {
  const all = daysOf({ from: monthStart(month), to: monthEnd(month) });
  const byDay = new Map(days.map((d) => [d.day, d]));
  const known = all.filter((d) => isNoted(byDay.get(d)) || byDay.get(d)?.closed);
  if (known.length < all.length * 0.9) return null;
  return known.reduce((s, d) => s + (byDay.get(d)?.amount ?? 0), 0);
}

// ── Les heures de pointe ─────────────────────────────────────────────────────

export type HourRow = { hour_start: string; gross_inc_vat: number | null };
export type HourCell = { weekday: number; hour: number; avg: number; level: 0 | 1 | 2 | 3 | 4 };
export type HourGrid = {
  range: DayRange;
  dates: number;
  hours: number[]; // ordre d'affichage (5 h → 4 h)
  /** cells[i][j] = heure hours[i], jour WEEK_ORDER[j]. */
  cells: HourCell[][];
  max: number;
  rush: { weekday: number; from: number; to: number; total: number } | null;
  /** Le moment le plus creux d'une heure forte ailleurs (ex. samedi midi contre mercredi midi). */
  dip: { weekday: number; hour: number; avg: number; vsWeekday: number; vsAvg: number; ratio: number } | null;
};

function brussels(iso: string): { day: string; hour: number } | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Rang d'une heure dans la journée d'un resto : 5 h en premier, 4 h en dernier (la nuit compte avec la veille). */
const hourRank = (h: number) => (h + 19) % 24;

/**
 * Ce que le resto encaisse en moyenne par heure et par jour de semaine, sur les
 * 8 semaines qui finissent au dernier jour lu. Une moyenne divise par le nombre
 * de dates de ce jour de semaine OUVERTES (au moins une vente ce jour-là), pas
 * par les heures vendues : une heure souvent vide tire bien la moyenne vers le bas.
 */
export function hourGrid(rows: HourRow[], lastRead: string | null): HourGrid | null {
  if (!lastRead) return null;
  const range = { from: addDays(lastRead, -(HISTORY_DAYS - 1)), to: lastRead };
  const sums = new Map<string, number>(); // `${weekday}|${hour}`
  const datesByWd = new Map<number, Set<string>>();
  for (const r of rows) {
    const b = brussels(r.hour_start);
    const v = Number(r.gross_inc_vat) || 0;
    if (!b || !inRange(b.day, range) || v <= 0) continue;
    const w = wd(b.day);
    sums.set(`${w}|${b.hour}`, (sums.get(`${w}|${b.hour}`) ?? 0) + v);
    const s = datesByWd.get(w) ?? new Set<string>();
    s.add(b.day);
    datesByWd.set(w, s);
  }
  const dates = [...datesByWd.values()].reduce((s, x) => s + x.size, 0);
  if (dates < MIN_HOURLY_DATES) return null;

  const avg = (w: number, h: number) => {
    const n = datesByWd.get(w)?.size ?? 0;
    return n ? (sums.get(`${w}|${h}`) ?? 0) / n : 0;
  };
  let max = 0;
  for (let h = 0; h < 24; h++) for (const w of WEEK_ORDER) max = Math.max(max, avg(w, h));
  if (max <= 0) return null;
  const hours = Array.from({ length: 24 }, (_, h) => h)
    .filter((h) => WEEK_ORDER.some((w) => avg(w, h) >= max * 0.03))
    .sort((a, b) => hourRank(a) - hourRank(b));
  const level = (v: number): HourCell["level"] => (v >= max * 0.7 ? 4 : v >= max * 0.5 ? 3 : v >= max * 0.32 ? 2 : v >= max * 0.18 ? 1 : 0);
  const cells = hours.map((h) => WEEK_ORDER.map((w) => ({ weekday: w, hour: h, avg: Math.round(avg(w, h)), level: level(avg(w, h)) })));

  // Le rush : les 3 heures d'affilée qui encaissent le plus, un même jour.
  let rush: HourGrid["rush"] = null;
  for (const w of WEEK_ORDER) {
    for (let i = 0; i + 2 < hours.length; i++) {
      if (hourRank(hours[i + 2]) - hourRank(hours[i]) !== 2) continue;
      const total = avg(w, hours[i]) + avg(w, hours[i + 1]) + avg(w, hours[i + 2]);
      if (!rush || total > rush.total) rush = { weekday: w, from: hours[i], to: (hours[i + 2] + 1) % 24, total: Math.round(total) };
    }
  }

  // Le creux : sur l'heure de midi la plus forte (11 h–14 h), le jour qui fait
  // le moins, s'il fait au moins 2,5 fois moins que le meilleur à la même heure.
  let dip: HourGrid["dip"] = null;
  const lunch = [11, 12, 13, 14].filter((h) => hours.includes(h));
  if (lunch.length) {
    const h = lunch.reduce((m, x) => (Math.max(...WEEK_ORDER.map((w) => avg(w, x))) > Math.max(...WEEK_ORDER.map((w) => avg(w, m))) ? x : m));
    const open = WEEK_ORDER.filter((w) => (datesByWd.get(w)?.size ?? 0) >= 2);
    if (open.length >= 2) {
      const top = open.reduce((m, w) => (avg(w, h) > avg(m, h) ? w : m));
      const low = open.reduce((m, w) => (avg(w, h) < avg(m, h) ? w : m));
      const ratio = avg(low, h) > 0 ? avg(top, h) / avg(low, h) : Infinity;
      if (ratio >= 2.5 && Number.isFinite(ratio)) {
        dip = { weekday: low, hour: h, avg: Math.round(avg(low, h)), vsWeekday: top, vsAvg: Math.round(avg(top, h)), ratio: Math.round(ratio * 10) / 10 };
      }
    }
  }
  return { range, dates, hours, cells, max, rush, dip };
}

// ── D'où vient le chiffre ────────────────────────────────────────────────────

export type ChannelShare = { label: string; value: number; pct: number; platform: boolean };
export type ChannelMix = { unit: "articles" | "euros"; range: DayRange; total: number; channels: ChannelShare[]; platformPct: number; platformNames: string[] };

const PLATFORM = /(uber|deliveroo|takeaway|just ?eat|thuisbezorgd)/i;

/** Lisible pour un gérant : les canaux de caisse Belpeople ont des noms techniques. */
export function channelName(raw: string): string {
  const s = raw.trim();
  if (/uber/i.test(s)) return "Uber Eats";
  if (/deliveroo/i.test(s)) return "Deliveroo";
  if (/takeaway|just ?eat/i.test(s)) return "Takeaway";
  if (/kiosk|borne/i.test(s)) return "Bornes de commande";
  if (/intake|counter|comptoir|pos\b/i.test(s)) return "Caisse au comptoir";
  if (/web|site|mobile|online/i.test(s)) return "Ton site";
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "Autre";
}

export function channelMix(parts: { name: string; value: number }[], unit: ChannelMix["unit"], range: DayRange): ChannelMix | null {
  const merged = new Map<string, number>();
  for (const p of parts) {
    if (!(p.value > 0)) continue;
    const label = channelName(p.name);
    merged.set(label, (merged.get(label) ?? 0) + p.value);
  }
  const total = [...merged.values()].reduce((s, v) => s + v, 0);
  if (total <= 0 || merged.size < 2) return null;
  const channels = [...merged.entries()]
    .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100), platform: PLATFORM.test(label) }))
    .sort((a, b) => b.value - a.value);
  const plat = channels.filter((c) => c.platform);
  const platformPct = Math.round((plat.reduce((s, c) => s + c.value, 0) / total) * 100);
  return { unit, range, total, channels, platformPct, platformNames: plat.map((c) => c.label) };
}

// ── Ce qu'il faut retenir (Chloé) ────────────────────────────────────────────

export type TipId = "jour_creux" | "heures" | "panier" | "plateformes" | "semaine_prochaine";
export type Tip = {
  id: TipId;
  /** Qui l'a remarqué : Chloé suit les chiffres (lib/agents/types.ts). */
  from: "chloe";
  title: string;
  body: string;
  todo: string;
  /** L'assistant qui peut porter l'action, et ce qu'il fait. */
  helper: { id: "hugo" | "lea"; text: string } | null;
  link: { href: string; label: string } | null;
};

export type ForecastDayLite = { date: string; expected: number; closed: boolean; factors: { label: string; effect: number }[] };

// Espaces insécables : « 1 670 € » et « 10 % » ne se coupent jamais en fin de ligne.
const eur = (n: number) => `${Math.round(n).toLocaleString("fr-BE").replace(/[\u202f ]/g, "\u00a0")}\u00a0€`;
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`);
const hourTxt = (h: number) => `${h} h`;
/** « d'octobre », « de novembre » */
const deMonth = (m: string) => (/^[aeiouyéè]/i.test(m) ? `d'${m}` : `de ${m}`);

export function chloeTips(input: {
  base: string;
  week: WeekType | null;
  grid: HourGrid | null;
  /** Commandes par jour et panier moyen sur les 28 derniers jours lus (null sans tickets). */
  orders: { perDay: number; basket: number; days: number } | null;
  channels: ChannelMix | null;
  forecast: ForecastDayLite[] | null;
}): Tip[] {
  const tips: Tip[] = [];
  const { base, week, grid, orders, channels, forecast } = input;
  const hugo = { id: "hugo" as const, text: "Hugo relance tes clients : quand il te propose un message pour ce jour-là, tu le retrouves dans Idées et tu dis oui ou non." };

  if (week?.best && week.weakest && week.best.weekday !== week.weakest.weekday) {
    const gap = (week.best.avg as number) - (week.weakest.avg as number);
    const gain = roundMoney((week.weakest.avg as number) * 0.1 * (52 / 12));
    if (gap / (week.best.avg as number) >= 0.15 && gain > 0) {
      const w = weekdayName(week.weakest.weekday);
      tips.push({
        id: "jour_creux",
        from: "chloe",
        title: `Ton ${w} rapporte ${eur(roundMoney(gap))} de moins que ton ${weekdayName(week.best.weekday)}.`,
        body: `Le ${w}, tu fais ${eur(roundMoney(week.weakest.avg as number))} en moyenne. Avec 10\u00a0% de clients en plus ce jour-là, c'est environ ${eur(gain)} de chiffre en plus par mois.`,
        todo: `une offre réservée au ${w} pour tes membres, ou une petite pub la veille au soir.`,
        helper: hugo,
        link: { href: `${base}/idees`, label: "Voir les idées de la brigade" },
      });
    }
  }

  if (grid?.rush) {
    const r = grid.rush;
    const dip = grid.dip;
    const lunchWord = (h: number) => (h >= 11 && h <= 14 ? "midi" : `à ${hourTxt(h)}`);
    tips.push({
      id: "heures",
      from: "chloe",
      title: `Ton rush, c'est le ${weekdayName(r.weekday)} de ${hourTxt(r.from)} à ${hourTxt(r.to)} : ${eur(roundMoney(r.total))} en 3 heures.`,
      body: dip
        ? `À l'inverse, le ${weekdayName(dip.weekday)} ${lunchWord(dip.hour)} est presque vide : ${eur(dip.avg)} à ${hourTxt(dip.hour)}, ${String(dip.ratio).replace(".", ",")} fois moins que le ${weekdayName(dip.vsWeekday)} à la même heure.`
        : "En dehors de ce créneau, la grille montre où il reste de la place.",
      todo: dip
        ? `une personne de plus le ${weekdayName(r.weekday)} soir pour ne perdre aucune commande ; une offre « ${weekdayName(dip.weekday)} ${lunchWord(dip.hour)} » pour remplir le creux.`
        : `une personne de plus le ${weekdayName(r.weekday)} sur ce créneau, pour ne perdre aucune commande.`,
      helper: dip ? hugo : null,
      link: null,
    });
  }

  if (orders && orders.days >= 7 && orders.perDay > 0) {
    const gain = roundMoney(orders.perDay * 30);
    tips.push({
      id: "panier",
      from: "chloe",
      title: `1 € de plus par commande = ${eur(gain)} de plus par mois.`,
      body: `Ton panier moyen est de ${orders.basket.toFixed(2).replace(".", ",")} €. Tu passes environ ${Math.round(orders.perDay)} commandes par jour : une boisson ou un dessert proposé à chaque fois suffit.`,
      todo: "demande à l'équipe de proposer « une boisson avec ? » à chaque commande pendant 2 semaines, puis reviens voir ce chiffre.",
      helper: null,
      link: null,
    });
  }

  if (channels && channels.platformPct >= PLATFORM_TIP_PCT && channels.platformNames.length > 0) {
    const what = channels.unit === "articles" ? "des articles vendus partent" : "de ton chiffre passe";
    tips.push({
      id: "plateformes",
      from: "chloe",
      title: `${channels.platformPct}\u00a0% ${what} par ${join(channels.platformNames)}.`,
      body: "Les plateformes prennent une commission, jusqu'à 30\u00a0% selon ton contrat. Chaque client qui revient commander au comptoir te laisse cette part.",
      todo: "glisse le QR du programme dans chaque sac de livraison : la prochaine fois, il vient chez toi.",
      helper: { id: "lea", text: "Léa inscrit ces clients et leur offre le cadeau d'accueil à leur premier ticket." },
      link: { href: `${base}/qr`, label: "Imprimer les QR" },
    });
  }

  const open = (forecast ?? []).filter((d) => !d.closed && d.expected > 0);
  if (open.length) {
    const top = open.reduce((m, d) => (d.expected > m.expected ? d : m));
    const strong = top.factors.filter((f) => Math.abs(f.effect) >= 0.05);
    tips.push({
      id: "semaine_prochaine",
      from: "chloe",
      title: `${listDay(top.date)}, attends-toi à environ ${eur(roundMoney(top.expected))}.`,
      body: strong.length
        ? `C'est ton plus gros jour des 7 prochains. Ce qui joue : ${strong.map((f) => `${f.label.toLowerCase()} (${f.effect > 0 ? "+" : "−"}${Math.round(Math.abs(f.effect) * 100)}\u00a0%)`).join(", ")}.`
        : "C'est ton plus gros jour des 7 prochains. Rien d'inhabituel n'est prévu : une semaine normale.",
      todo: "prévois ton stock et ton équipe de ce jour-là en conséquence.",
      helper: null,
      link: null,
    });
  }
  return tips;
}

/** Commandes par jour et panier moyen sur les 28 jours qui finissent au dernier jour lu. */
export function recentOrders(days: CaDay[], lastRead: string | null): { perDay: number; basket: number; days: number } | null {
  if (!lastRead) return null;
  const range = { from: addDays(lastRead, -27), to: lastRead };
  const withTickets = days.filter((d) => inRange(d.day, range) && isNoted(d) && typeof d.tickets === "number" && d.tickets > 0);
  if (withTickets.length === 0) return null;
  const orders = withTickets.reduce((s, d) => s + (d.tickets as number), 0);
  const total = withTickets.reduce((s, d) => s + (d.amount as number), 0);
  return { perDay: orders / withTickets.length, basket: total / orders, days: withTickets.length };
}

/** La phrase « Novembre devrait finir vers… » (Stats et page). */
export function projectionSentence(p: MonthProjection, lastMonth: { name: string; total: number } | null, compare: CaSummary["compare"], readDays: number): string {
  const cap = p.name.charAt(0).toUpperCase() + p.name.slice(1);
  let s = `${cap} devrait finir vers ${eur(p.expected)}`;
  if (lastMonth) {
    const diff = (p.expected - lastMonth.total) / lastMonth.total;
    s += Math.abs(diff) < 0.03 ? `, comme ${lastMonth.name}` : diff > 0 ? `, plus qu'en ${lastMonth.name} (${eur(roundMoney(lastMonth.total))})` : `, moins qu'en ${lastMonth.name} (${eur(roundMoney(lastMonth.total))})`;
  }
  s += ".";
  if (compare && compare.changePct >= 3 && p.remainingDays > 0) {
    const target = roundMoney(p.readTotal + (p.expected - p.readTotal) * (1 + compare.changePct / 100));
    if (target > p.expected) s += ` Tes ${readDays} premiers jours sont à +${compare.changePct}\u00a0% : si ça tient, tu vises ${eur(target)}.`;
  } else if (compare && compare.changePct <= -3) {
    s += ` Tes ${readDays} premiers jours sont à −${Math.abs(compare.changePct)}\u00a0% par rapport aux mêmes jours ${deMonth(monthName(compare.window.from))}.`;
  }
  return s;
}

/**
 * L'encadré « À retenir » du bloc CA de Stats : deux phrases au plus, de Chloé.
 * La projection du mois d'abord, puis le jour le plus faible et ce qu'il vaut.
 */
export function statsTakeaways(input: {
  month: MonthProjection | null;
  lastMonth: { name: string; total: number } | null;
  summary: CaSummary | null;
  week: WeekType | null;
}): string[] {
  const out: string[] = [];
  const { month, lastMonth, summary, week } = input;
  if (month) out.push(projectionSentence(month, lastMonth, summary?.compare ?? null, summary?.notedDays ?? 0));
  if (week?.best && week.weakest && week.best.weekday !== week.weakest.weekday) {
    const gain = roundMoney((week.weakest.avg as number) * 0.1 * (52 / 12));
    const gap = 1 - (week.weakest.avg as number) / (week.best.avg as number);
    if (gap >= 0.15 && gain > 0) {
      const w = weekdayName(week.weakest.weekday);
      out.push(`Le ${w} est ton jour le plus faible. 10\u00a0% de clients en plus le ${w} = +${eur(gain)} par mois.`);
    }
  }
  return out;
}
