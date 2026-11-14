// ============================================================
// La page « Stats » de la vue simple (ADR 0064 amendé, ADR 0089) — logique
// PURE : la date du jour est injectée, chaque chiffre se recalcule à la main
// depuis les lignes sources (même contrat que lib/program-value.ts).
//
// Maquette validée le 2026-11-14 : https://claude.ai/artifact/87hGzRBqX2dSW9metwAYCo
// (une phrase en clair, puis Tes clients · Ton chiffre d'affaires · Ta
// réputation sur Google · Tes réseaux · Tes messages aux clients · Ta
// progression ; le forfait décide de l'ordre et des blocs).
//
// Règles tenues ici :
//   - aucune valeur inventée : un chiffre absent n'est pas affiché, il n'est
//     jamais remplacé par une estimation ;
//   - une comparaison n'est faite que sur une période comparable (mêmes jours
//     du mois précédent) et avec assez de jours notés des deux côtés ;
//   - jamais « grâce à nous » : le CA des clients du programme est une part
//     du chiffre, pas un chiffre additionnel (ADR 0064, ADR 0081).
// Surface restaurateur uniquement : les euros y sont permis (ADR 0007 §admin).
// ============================================================

import { addDays } from "./console-journey";

export type StatsPeriodKey = "mois" | "mois-dernier" | "debut";
export const STATS_PERIODS: { key: StatsPeriodKey; label: string }[] = [
  { key: "mois", label: "Ce mois" },
  { key: "mois-dernier", label: "Mois dernier" },
  { key: "debut", label: "Depuis le début" },
];

export function parseStatsPeriod(v: string | undefined | null): StatsPeriodKey {
  return v === "mois-dernier" || v === "debut" ? v : "mois";
}

/** Jours inclus, au format AAAA-MM-JJ (jour belge). */
export type DayRange = { from: string; to: string };

export type StatsPeriod = {
  key: StatsPeriodKey;
  current: DayRange;
  /** Période de comparaison : mêmes jours du mois d'avant. null « depuis le début ». */
  previous: DayRange | null;
  /** « octobre » — le mois auquel on se compare. */
  compareName: string | null;
  /** « du 1er au 9 novembre », « en octobre », « depuis le 12 juin 2026 ». */
  label: string;
};

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}
function lastDayOfMonth(day: string): string {
  return addDays(monthStart(addDays(monthStart(day), 32)), -1);
}
function monthName(day: string): string {
  return MONTHS[Number(day.slice(5, 7)) - 1];
}
function dayNum(day: string): number {
  return Number(day.slice(8, 10));
}
function ordinal(n: number): string {
  return n === 1 ? "1er" : String(n);
}

/** Les mêmes jours du mois précédent : le 1er → min(même quantième, fin du mois). */
function sameDaysOfPreviousMonth(range: DayRange): DayRange {
  const prevStart = monthStart(addDays(monthStart(range.from), -1));
  const prevEnd = lastDayOfMonth(prevStart);
  const wanted = `${prevStart.slice(0, 8)}${String(dayNum(range.to)).padStart(2, "0")}`;
  return { from: prevStart, to: wanted > prevEnd ? prevEnd : wanted };
}

export function statsPeriod(key: StatsPeriodKey, today: string, firstDay: string | null): StatsPeriod {
  if (key === "debut") {
    const from = firstDay && firstDay <= today ? firstDay : today;
    return {
      key,
      current: { from, to: today },
      previous: null,
      compareName: null,
      label: `depuis le ${ordinal(dayNum(from))} ${monthName(from)} ${from.slice(0, 4)}`,
    };
  }
  if (key === "mois-dernier") {
    const from = monthStart(addDays(monthStart(today), -1));
    const current = { from, to: lastDayOfMonth(from) };
    const previous = sameDaysOfPreviousMonth(current);
    return { key, current, previous, compareName: monthName(previous.from), label: `en ${monthName(from)}` };
  }
  const current = { from: monthStart(today), to: today };
  const previous = sameDaysOfPreviousMonth(current);
  const label =
    dayNum(today) === 1 ? `le 1er ${monthName(today)}` : `du 1er au ${dayNum(today)} ${monthName(today)}`;
  return { key, current, previous, compareName: monthName(previous.from), label };
}

export function inRange(day: string, r: DayRange): boolean {
  return day >= r.from && day <= r.to;
}

export function daysIn(r: DayRange): string[] {
  const out: string[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ── Tes clients ──────────────────────────────────────────────────────────────

/** Un ticket validé : qui, quel jour (belge), combien. */
export type StatsTicket = { userId: string; day: string; amount: number };

export type ClientNumbers = {
  tickets: number;
  clients: number;
  newClients: number;
  /** Part des clients venus qui sont venus au moins deux jours différents. null sans client. */
  returningPct: number | null;
};

export type ClientStats = ClientNumbers & {
  ticketsDelta: number | null;
  returningDeltaPts: number | null;
  giftsRedeemed: number;
};

/**
 * Chiffres clients d'une période. « Revenu » = un client de la période qui a
 * des tickets sur au moins deux jours différents (avant ou pendant la période) :
 * il est venu, puis revenu. « Nouveau » = son premier ticket tombe dans la période.
 */
export function clientNumbers(tickets: StatsTicket[], range: DayRange): ClientNumbers {
  const daysByUser = new Map<string, Set<string>>();
  const firstDay = new Map<string, string>();
  let count = 0;
  for (const t of tickets) {
    if (t.day > range.to) continue;
    const first = firstDay.get(t.userId);
    if (!first || t.day < first) firstDay.set(t.userId, t.day);
    let set = daysByUser.get(t.userId);
    if (!set) daysByUser.set(t.userId, (set = new Set()));
    set.add(t.day);
    if (t.day >= range.from) count++;
  }
  let clients = 0;
  let newClients = 0;
  let returning = 0;
  for (const [userId, days] of daysByUser) {
    if (![...days].some((d) => d >= range.from)) continue;
    clients++;
    if ((firstDay.get(userId) ?? "") >= range.from) newClients++;
    if (days.size >= 2) returning++;
  }
  return {
    tickets: count,
    clients,
    newClients,
    returningPct: clients > 0 ? Math.round((returning / clients) * 100) : null,
  };
}

export function clientStats(
  tickets: StatsTicket[],
  period: Pick<StatsPeriod, "current" | "previous">,
  giftDays: string[]
): ClientStats {
  const cur = clientNumbers(tickets, period.current);
  const prev = period.previous ? clientNumbers(tickets, period.previous) : null;
  return {
    ...cur,
    // Une période d'avant sans aucun ticket n'est pas un point de comparaison :
    // « +64 vs octobre » pour un établissement ouvert en novembre mentirait.
    ticketsDelta: prev && prev.tickets > 0 ? cur.tickets - prev.tickets : null,
    returningDeltaPts:
      prev && prev.returningPct !== null && cur.returningPct !== null && prev.clients >= MIN_CLIENTS_FOR_PCT && cur.clients >= MIN_CLIENTS_FOR_PCT
        ? cur.returningPct - prev.returningPct
        : null,
    giftsRedeemed: giftDays.filter((d) => inRange(d, period.current)).length,
  };
}

/** En dessous, un pourcentage de clients revenus ne dit rien (2 sur 3 = 67 %). */
export const MIN_CLIENTS_FOR_PCT = 5;

// ── Ton chiffre d'affaires ──────────────────────────────────────────────────

/** Un jour du CA noté (ou importé) : montant, ou fermé. */
export type StatsRevenueDay = { day: string; amount: number | null; closed: boolean };

/** Assez de jours notés des deux côtés pour comparer des moyennes par jour. */
export const MIN_NOTED_TO_COMPARE = 5;

export type RevenueBar = { day: string; amount: number | null; closed: boolean };

export type RevenueStats = {
  total: number;
  notedDays: number;
  /** Jours écoulés de la période (aujourd'hui exclu : il n'est pas fini). */
  elapsedDays: number;
  bars: RevenueBar[];
  /** Variation de la moyenne par jour noté vs les mêmes jours du mois d'avant. */
  changePct: number | null;
  /** Part du CA noté qui vient des tickets du programme, sur les mêmes jours. */
  programSharePct: number | null;
};

function noted(days: StatsRevenueDay[], r: DayRange): StatsRevenueDay[] {
  return days.filter((d) => inRange(d.day, r) && !d.closed && typeof d.amount === "number");
}

export function revenueStats(
  days: StatsRevenueDay[],
  programByDay: Record<string, { amount: number }>,
  period: Pick<StatsPeriod, "current" | "previous">,
  today: string
): RevenueStats {
  const cur = noted(days, period.current);
  const total = cur.reduce((s, d) => s + (d.amount as number), 0);
  const lastDay = period.current.to >= today ? addDays(today, -1) : period.current.to;
  const elapsed = lastDay >= period.current.from ? daysIn({ from: period.current.from, to: lastDay }) : [];
  const byDay = new Map(days.map((d) => [d.day, d]));
  const bars = elapsed.map((day) => {
    const d = byDay.get(day);
    return { day, amount: d && !d.closed && typeof d.amount === "number" ? d.amount : null, closed: !!d?.closed };
  });

  let changePct: number | null = null;
  if (period.previous) {
    const prev = noted(days, period.previous);
    const prevTotal = prev.reduce((s, d) => s + (d.amount as number), 0);
    if (cur.length >= MIN_NOTED_TO_COMPARE && prev.length >= MIN_NOTED_TO_COMPARE && prevTotal > 0) {
      const avg = total / cur.length;
      const prevAvg = prevTotal / prev.length;
      changePct = Math.round(((avg - prevAvg) / prevAvg) * 100);
    }
  }

  // Les tickets du programme ne comptent que les jours où le CA est noté :
  // sinon la part grimperait sur les jours oubliés.
  const programOnNoted = cur.reduce((s, d) => s + (programByDay[d.day]?.amount ?? 0), 0);
  const programSharePct =
    total > 0 && cur.length >= MIN_NOTED_TO_COMPARE ? Math.min(100, Math.round((programOnNoted / total) * 100)) : null;

  return { total, notedDays: cur.length, elapsedDays: elapsed.length, bars, changePct, programSharePct };
}

/** « 1 euro sur 5 » quand la part s'y prête (10 à 50 %), sinon « 7 % de ton chiffre ». */
export function shareSentence(pct: number): string {
  if (pct >= 10 && pct <= 50) return `1 euro sur ${Math.round(100 / pct)} vient de tes clients du programme`;
  return `${pct} % de ton chiffre vient de tes clients du programme`;
}

// ── La phrase du haut ───────────────────────────────────────────────────────

export function statsHeadline(input: {
  period: StatsPeriod;
  clients: ClientStats;
  /** null quand le forfait ne montre pas le CA comparé (Gratuit). */
  revenue: RevenueStats | null;
}): string {
  const { period, clients, revenue } = input;
  if (revenue && revenue.changePct !== null) {
    const c = revenue.changePct;
    const trend =
      c === 0 ? "Ton chiffre est stable sur les mêmes jours" : `Ton chiffre est en ${c > 0 ? "hausse" : "baisse"} de ${Math.abs(c)} % sur les mêmes jours`;
    return revenue.programSharePct !== null && revenue.programSharePct > 0
      ? `${trend}, et ${shareSentence(revenue.programSharePct)}.`
      : `${trend}.`;
  }

  const when = period.key === "mois" ? "ce mois" : period.key === "mois-dernier" ? `en ${period.label.replace(/^en /, "")}` : "depuis le début";
  if (clients.tickets === 0) return period.key === "debut" ? "Pas encore de ticket reçu." : `Pas encore de ticket ${when}.`;

  const t = `${clients.tickets} ticket${clients.tickets > 1 ? "s" : ""}`;
  let first: string;
  if (clients.ticketsDelta !== null && clients.ticketsDelta > 0 && period.compareName) {
    first = `${period.key === "debut" ? "" : "Bon mois : "}${t}, ${clients.ticketsDelta} de plus qu’en ${period.compareName}.`;
  } else if (clients.ticketsDelta !== null && clients.ticketsDelta < 0 && period.compareName) {
    first = `${t} ${when}, ${-clients.ticketsDelta} de moins qu’en ${period.compareName}.`;
  } else {
    first = `${t} ${when}.`;
  }
  first = first.charAt(0).toUpperCase() + first.slice(1);

  if (clients.returningPct !== null && clients.clients >= MIN_CLIENTS_FOR_PCT && clients.returningPct > 0) {
    return `${first} ${clients.returningPct} % de tes clients sont revenus.`;
  }
  if (clients.newClients > 0) {
    return `${first} ${clients.newClients} nouveau${clients.newClients > 1 ? "x" : ""} client${clients.newClients > 1 ? "s" : ""}.`;
  }
  return first;
}

// ── Ce qui se vend ──────────────────────────────────────────────────────────

export type StatsItemLine = { name: string; quantity: number; ignored?: boolean };

/** Les plats les plus vendus de la période, par quantité. Lignes techniques exclues (ADR 0046). */
export function topDishes(lines: StatsItemLine[], n = 3): { name: string; quantity: number }[] {
  const byName = new Map<string, { name: string; quantity: number }>();
  for (const l of lines) {
    if (l.ignored) continue;
    const key = l.name.trim().toLowerCase();
    if (!key) continue;
    const cur = byName.get(key) ?? { name: l.name.trim(), quantity: 0 };
    cur.quantity += Number(l.quantity) || 1;
    byName.set(key, cur);
  }
  return [...byName.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "fr")).slice(0, n);
}

/** Variation signée pour l'affichage : « +38 », « −4 ». */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}
