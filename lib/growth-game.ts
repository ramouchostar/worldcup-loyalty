// ============================================================
// Le jeu de la croissance (ADR 0081) — d'abord la machine, ensuite le chiffre.
//
// Étape 1 « Lancer la machine » : 100 tickets validés ET 200 nouveaux contacts
// sur 90 jours. Étape 2 « Faire grandir le chiffre » : des paliers de chiffre
// d'affaires par jour, calculés sur les ventes de caisse (`restaurant_sales`,
// alimentées par le CA du jour de l'ADR 0078 ou l'import CSV de l'ADR 0027).
//
// Fonctions PURES, même contrat que lib/console-journey.ts : la date du jour
// est injectée (jour belge YYYY-MM-DD), rien n'est stocké, tout se rejoue
// depuis les lignes sources — un niveau se vérifie à la main.
//
// Surface restaurateur uniquement : les euros sont permis (ADR 0027 §1), rien
// ici ne remonte jamais vers un membre (ADR 0007).
// ============================================================

import { addDays, daysToReach } from "./console-journey";

// ── Étapes ──────────────────────────────────────────────────────────────────

export const MACHINE_WINDOW_DAYS = 90;
export const MACHINE_TICKETS = 100;
export const MACHINE_CONTACTS = 200;

export type GrowthStage = "machine" | "chiffre";

export function growthStage(v: { tickets90: number; contacts90: number }): GrowthStage {
  return v.tickets90 >= MACHINE_TICKETS && v.contacts90 >= MACHINE_CONTACTS ? "chiffre" : "machine";
}

/** Le rythme se mesure sur 7 jours, ou depuis le démarrage s'il est plus récent. */
export const PACE_WINDOW_DAYS = 7;
/** Dès le premier jour : le rythme du lancement motive, et se corrige tout seul le lendemain. */
export const PACE_MIN_DAYS = 1;

/**
 * Jours sur lesquels mesurer le rythme : 7, ou moins si la première activité
 * (premier ticket, premier contact) est plus récente. Un établissement lancé
 * il y a 2 jours avec 12 tickets va à 6 par jour, pas à 12 ÷ 7 — diviser par 7
 * repoussait sa date de plusieurs semaines et le démotivait (terrain De Bue,
 * 2026-10-08).
 */
export function activeDays(firstDay: string | null, today: string): number {
  if (!firstDay) return PACE_WINDOW_DAYS;
  const elapsed = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${firstDay}T12:00:00Z`)) / 86_400_000) + 1;
  return Math.max(PACE_MIN_DAYS, Math.min(PACE_WINDOW_DAYS, elapsed));
}

/**
 * Jours estimés avant que les DEUX jauges soient pleines, au rythme qu'il a
 * déjà pris. null : l'une des deux n'avance pas (on ne promet rien).
 */
export function machineEta(v: {
  tickets90: number;
  contacts90: number;
  ticketsWeek: number;
  contactsWeek: number;
  ticketsDays?: number;
  contactsDays?: number;
}): number | null {
  const t = daysToReach(MACHINE_TICKETS - v.tickets90, v.ticketsWeek / (v.ticketsDays ?? PACE_WINDOW_DAYS));
  const c = daysToReach(MACHINE_CONTACTS - v.contacts90, v.contactsWeek / (v.contactsDays ?? PACE_WINDOW_DAYS));
  if (t === null || c === null) return null;
  return Math.max(t, c);
}

/** « dans 9 jours », « dans environ 3 semaines » — un délai se dit, une date lointaine démotive. */
export function etaLabel(days: number): string {
  if (days <= 1) return "dès demain";
  if (days < 14) return `dans ${days} jours`;
  return `dans environ ${Math.ceil(days / 7)} semaines`;
}

// ── Ventes par jour ─────────────────────────────────────────────────────────

/** CA par jour belge (YYYY-MM-DD). Un jour sans ligne = fermé ou pas noté. */
export type DailySales = Record<string, number>;

/** Somme les lignes de vente par jour (un import CSV en a une par ticket). */
export function salesByDay(rows: { sold_on: string; amount: number }[]): DailySales {
  const out: DailySales = {};
  for (const r of rows) {
    const day = String(r.sold_on).slice(0, 10);
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    out[day] = (out[day] ?? 0) + amount;
  }
  return out;
}

// ── Le départ et les paliers ────────────────────────────────────────────────

/** Jours notés qu'il faut pour calculer le départ. */
export const BASELINE_DAYS = 28;
/** Chaque palier ajoute 5 % du départ. */
export const STEP_PCT = 0.05;
/** Le cap est le cinquième palier (≈ +25 %). */
export const CAP_STEPS = 5;
/** On monte en tenant le palier suivant 3 semaines sur les 4 dernières. */
export const HELD_WEEKS = 3;
export const WINDOW_WEEKS = 4;
/** Une semaine compte si elle a au moins 3 jours notés. */
export const MIN_DAYS_PER_WEEK = 3;

const round10 = (n: number) => Math.round(n / 10) * 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Le départ : moyenne par jour ouvert des 28 PREMIERS jours notés. Stable : il
 * ne bouge plus une fois calculé (un départ glissant cacherait la progression).
 * Un jour à 0 € est compté (ouvert mais vide) ; un jour fermé n'a pas de ligne.
 */
export function baseline(sales: DailySales): { amount: number; lastDay: string } | null {
  const days = Object.keys(sales).sort();
  if (days.length < BASELINE_DAYS) return null;
  const first = days.slice(0, BASELINE_DAYS);
  const total = first.reduce((s, d) => s + sales[d], 0);
  return { amount: round2(total / BASELINE_DAYS), lastDay: first[first.length - 1] };
}

/**
 * Les cinq paliers au-dessus du départ. Une marche FIXE de 5 % du départ,
 * arrondie à 10 € (au moins 10 €) : des marches égales se lisent d'un coup
 * d'œil (350 € → 370, 390, 410, 430, 450), là où « +5 % arrondi » donnerait
 * des marches inégales (370, 390, 400…).
 */
export function steps(depart: number): number[] {
  const step = Math.max(10, round10(depart * STEP_PCT));
  return Array.from({ length: CAP_STEPS }, (_, i) => round10(depart) + step * (i + 1));
}

// ── Semaines ────────────────────────────────────────────────────────────────

/** Le lundi de la semaine d'un jour (semaine du lundi au dimanche). */
export function mondayOf(day: string): string {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(day, -((wd + 6) % 7));
}

export type WeekAvg = { monday: string; days: number; avg: number };

/** Moyennes par semaine des jours notés de `from` (inclus) à `before` (exclu). */
export function weeklyAverages(sales: DailySales, from: string, before: string): WeekAvg[] {
  const byWeek = new Map<string, { days: number; total: number }>();
  for (const [day, amount] of Object.entries(sales)) {
    if (day < from || day >= before) continue;
    const m = mondayOf(day);
    const w = byWeek.get(m) ?? { days: 0, total: 0 };
    w.days += 1;
    w.total += amount;
    byWeek.set(m, w);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([monday, w]) => ({ monday, days: w.days, avg: round2(w.total / w.days) }));
}

// ── Le niveau ───────────────────────────────────────────────────────────────

export type WeekResult = WeekAvg & { target: number; held: boolean };

/**
 * Rejoue la progression semaine après semaine, dans l'ordre. `level` = nombre
 * de paliers gagnés (0 = au départ). Un niveau gagné l'est pour de bon ; après
 * un passage, le compte des semaines repart de zéro sur le palier suivant.
 * Seules les semaines TERMINÉES et assez notées comptent.
 */
export function replayLevel(stepList: number[], weeks: WeekAvg[]): { level: number; recent: WeekResult[] } {
  let level = 0;
  let recent: WeekResult[] = [];
  for (const w of weeks) {
    if (w.days < MIN_DAYS_PER_WEEK) continue;
    if (level >= stepList.length) break; // cap atteint
    const target = stepList[level];
    recent = [...recent, { ...w, target, held: w.avg >= target }].slice(-WINDOW_WEEKS);
    if (recent.filter((r) => r.held).length >= HELD_WEEKS) {
      level += 1;
      recent = [];
    }
  }
  return { level, recent };
}

// ── La vue de l'accueil ─────────────────────────────────────────────────────

export type GrowthView =
  | {
      stage: "machine";
      tickets90: number;
      contacts90: number;
      ticketsWeek: number;
      contactsWeek: number;
      /** Jours avant le déblocage du chiffre, au rythme de la semaine. */
      eta: number | null;
      notedDays: number;
    }
  | {
      stage: "chiffre";
      tickets90: number;
      contacts90: number;
      ticketsWeek: number;
      contactsWeek: number;
      notedDays: number;
      /** null : pas encore 28 jours notés — on pousse la saisie. */
      game: null | {
        depart: number;
        steps: number[];
        cap: number;
        /** Niveau affiché : 1 au départ, 2 après le premier palier… */
        level: number;
        capReached: boolean;
        /** Le palier à tenir (le prochain au-dessus du niveau). null au cap. */
        target: number | null;
        /** Moyenne par jour de la semaine en cours (ou de la dernière notée). */
        current: { avg: number; days: number; thisWeek: boolean } | null;
        /** Euros par jour qui manquent pour tenir le palier (0 si tenu). */
        gap: number | null;
        /** Les semaines qui comptent vers le prochain niveau (au plus 4). */
        recent: WeekResult[];
        heldWeeks: number;
      };
    };

export type GrowthRaw = {
  today: string;
  /** Premier ticket validé et première adhésion (jour belge), pour le rythme. */
  firstTicketDay?: string | null;
  firstContactDay?: string | null;
  tickets90: number;
  contacts90: number;
  ticketsWeek: number;
  contactsWeek: number;
  sales: DailySales;
};

export function buildGrowthView(raw: GrowthRaw): GrowthView {
  const notedDays = Object.keys(raw.sales).filter((d) => d <= raw.today).length;
  const counts = { tickets90: raw.tickets90, contacts90: raw.contacts90, ticketsWeek: raw.ticketsWeek, contactsWeek: raw.contactsWeek };
  if (growthStage(raw) === "machine") {
    const eta = machineEta({
      ...counts,
      ticketsDays: activeDays(raw.firstTicketDay ?? null, raw.today),
      contactsDays: activeDays(raw.firstContactDay ?? null, raw.today),
    });
    return { stage: "machine", ...counts, eta, notedDays };
  }

  const base = baseline(raw.sales);
  if (!base) return { stage: "chiffre", ...counts, notedDays, game: null };

  const stepList = steps(base.amount);
  const monday = mondayOf(raw.today);
  // Les semaines terminées après la période du départ comptent pour le niveau.
  const done = weeklyAverages(raw.sales, addDays(base.lastDay, 1), monday);
  const { level, recent } = replayLevel(stepList, done);
  const capReached = level >= stepList.length;
  const target = capReached ? null : stepList[level];

  const thisWeek = weeklyAverages(raw.sales, monday, addDays(raw.today, 1))[0] ?? null;
  const lastWeek = weeklyAverages(raw.sales, addDays(base.lastDay, 1), monday).pop() ?? null;
  const shown = thisWeek ?? lastWeek;
  const current = shown ? { avg: shown.avg, days: shown.days, thisWeek: shown === thisWeek } : null;

  return {
    stage: "chiffre",
    ...counts,
    notedDays,
    game: {
      depart: base.amount,
      steps: stepList,
      cap: stepList[stepList.length - 1],
      level: level + 1,
      capReached,
      target,
      current,
      gap: target !== null && current ? Math.max(0, Math.ceil(target - current.avg)) : null,
      recent,
      heldWeeks: recent.filter((r) => r.held).length,
    },
  };
}
