// ============================================================
// Moteur de forecast de CA — DÉTERMINISTE (ADR 0027 §5-§7).
//
// Aucune dépendance externe, aucun `Date.now()` : la date « aujourd'hui » est
// INJECTÉE → le moteur est 100 % reproductible et testable.
//
// Modèle en couches, chaque facteur explicable :
//   L0  base niveau  = profil par jour de semaine (médiane + p25/p75) du CSV
//   L1  calendrier   = multiplicateurs CALIBRÉS sur l'historique du resto
//                      (paye, jours fériés, vacances scolaires) + événements
//                      nationaux/locaux (estimés par direction)
//   L2  programme    = promo programmée (estimée)
// Sortie : fourchette + niveau de confiance + plancher « pas assez de données ».
//
// Rien ici n'atteint jamais un membre — surface admin only (ADR 0007).
// ============================================================

export type SaleRow = { sold_on: string; sold_at: string | null; amount: number };
export type RefCalRow = {
  kind: "school_holiday" | "national_event";
  community: string | null;
  starts_on: string;
  ends_on: string;
  label: string;
  expected_effect: "up" | "down" | null;
};
export type LocalEventRow = {
  starts_on: string;
  ends_on: string;
  label: string;
  expected_effect: "up" | "down";
};

export type Factor = { label: string; effect: number; estimated: boolean };
export type DayForecast = {
  date: string; // AAAA-MM-JJ
  weekdayLabel: string;
  closed: boolean;
  low: number;
  expected: number;
  high: number;
  factors: Factor[];
};

export type ForecastInput = {
  today: string; // AAAA-MM-JJ (injecté)
  sales: SaleRow[];
  referenceCalendar: RefCalRow[];
  localEvents: LocalEventRow[];
  promoDates: string[]; // scheduled_broadcasts.promo_on à venir
  schoolCommunity: "FR" | "NL" | "DE" | null;
};

export type ForecastResult =
  | { status: "insufficient_data"; weeksOfData: number; message: string }
  | {
      status: "ok";
      confidence: "low" | "medium" | "high";
      confidenceReason: string;
      days: DayForecast[];
      weekTotal: { low: number; expected: number; high: number };
      weeksOfData: number;
    };

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MIN_WEEKS = 4; // plancher (ADR 0027 §7)
const MIN_DISTINCT_DAYS = 20; // densité minimale (évite 2 dates espacées de 5 semaines)
const CALIB_MIN_SAMPLES = 3; // on ne calibre un facteur qu'avec ≥3 occurrences passées

// ── Dates (UTC, sans fuseau — le moteur ne dépend d'aucune horloge) ──────────

function weekdayIndex(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = dimanche
  return (d + 6) % 7; // 0 = lundi … 6 = dimanche
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
function inRange(ymd: string, r: { starts_on: string; ends_on: string }): boolean {
  return ymd >= r.starts_on && ymd <= r.ends_on; // comparaison lexicographique OK sur ISO
}

// ── Stats ────────────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}
function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}
function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return 0;
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance) / m;
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// ── Jours fériés belges (calculés — aucune table, ADR 0027 §6) ───────────────

/** Dimanche de Pâques (algorithme Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function belgianPublicHolidays(year: number): Map<string, string> {
  const map = new Map<string, string>();
  const fixed: [string, string][] = [
    [`${year}-01-01`, "Nouvel An"],
    [`${year}-05-01`, "Fête du travail"],
    [`${year}-07-21`, "Fête nationale"],
    [`${year}-08-15`, "Assomption"],
    [`${year}-11-01`, "Toussaint"],
    [`${year}-11-11`, "Armistice"],
    [`${year}-12-25`, "Noël"],
  ];
  for (const [d, n] of fixed) map.set(d, n);
  const easter = easterSunday(year);
  map.set(addDays(easter, 1), "Lundi de Pâques");
  map.set(addDays(easter, 39), "Ascension");
  map.set(addDays(easter, 50), "Lundi de Pentecôte");
  return map;
}

/** Fenêtre de paye : fin/début de mois (calculée, ADR 0027 §6). */
export function isPaydayWindow(ymd: string): boolean {
  const dom = Number(ymd.slice(8, 10));
  return dom >= 28 || dom <= 3;
}

// ── Moteur ───────────────────────────────────────────────────────────────────

const MSG_INSUFFICIENT =
  "Importe encore quelques semaines de ventes pour débloquer tes prévisions — il faut au moins 4 semaines d'historique pour prévoir sérieusement.";

export function computeForecast(input: ForecastInput): ForecastResult {
  const { today, sales } = input;

  // 1. Agrégat journalier (une ligne CSV = un ticket ; on somme par jour).
  const dailyTotals = new Map<string, number>();
  for (const s of sales) {
    dailyTotals.set(s.sold_on, (dailyTotals.get(s.sold_on) ?? 0) + Number(s.amount));
  }
  const dates = [...dailyTotals.keys()].sort();
  if (dates.length === 0) {
    return { status: "insufficient_data", weeksOfData: 0, message: MSG_INSUFFICIENT };
  }
  const spanDays = daysBetween(dates[0], dates[dates.length - 1]) + 1;
  const weeksOfData = Math.floor(spanDays / 7);
  if (weeksOfData < MIN_WEEKS || dates.length < MIN_DISTINCT_DAYS) {
    return { status: "insufficient_data", weeksOfData, message: MSG_INSUFFICIENT };
  }

  // 2. L0 — base par jour de semaine : médiane (niveau) + p25/p75 (fourchette
  //    = variance historique de CE jour, ADR 0027 §7). Bande élargie si < 3 points.
  const byWeekday: number[][] = Array.from({ length: 7 }, () => []);
  for (const d of dates) byWeekday[weekdayIndex(d)].push(dailyTotals.get(d)!);
  const base = byWeekday.map((vals) => {
    if (vals.length === 0) return { expected: 0, low: 0, high: 0, n: 0 };
    const sorted = [...vals].sort((a, b) => a - b);
    const expected = median(sorted);
    if (sorted.length < 3) return { expected, low: expected * 0.75, high: expected * 1.3, n: sorted.length };
    return { expected, low: percentile(sorted, 25), high: percentile(sorted, 75), n: sorted.length };
  });

  // 3. Normalisation : valeur / médiane du jour de semaine → retire l'effet
  //    « jour » pour calibrer proprement les multiplicateurs de calendrier.
  const normalized = new Map<string, number>();
  for (const d of dates) {
    const b = base[weekdayIndex(d)].expected;
    if (b > 0) normalized.set(d, dailyTotals.get(d)! / b);
  }

  // Jours fériés sur toute la période + la semaine à venir.
  const holidayMap = new Map<string, string>();
  const yStart = Number(dates[0].slice(0, 4));
  const yEnd = Number(addDays(today, 7).slice(0, 4));
  for (let y = yStart; y <= yEnd; y++) {
    for (const [d, n] of belgianPublicHolidays(y)) holidayMap.set(d, n);
  }
  const schoolRanges = input.referenceCalendar.filter(
    (r) => r.kind === "school_holiday" && (r.community == null || r.community === input.schoolCommunity)
  );
  const nationalRanges = input.referenceCalendar.filter((r) => r.kind === "national_event");
  const promoSet = new Set(input.promoDates);

  // L1 — calibration des facteurs calibrables sur l'historique du resto.
  // multiplicateur ≈ niveau normalisé moyen les jours où le facteur s'applique
  // (base normalisée ≈ 1). Non calibré si < 3 occurrences → aucun effet montré.
  const calibrate = (applies: (d: string) => boolean): number | undefined => {
    const vals: number[] = [];
    for (const d of dates) {
      const nv = normalized.get(d);
      if (nv != null && applies(d)) vals.push(nv);
    }
    if (vals.length < CALIB_MIN_SAMPLES) return undefined;
    return clamp(mean(vals), 0.6, 1.6);
  };
  const calibPayday = calibrate(isPaydayWindow);
  const calibHoliday = calibrate((d) => holidayMap.has(d));
  const calibSchool = calibrate((d) => schoolRanges.some((r) => inRange(d, r)));

  // 4. Projection sur 7 jours (aujourd'hui inclus).
  const days: DayForecast[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const wd = weekdayIndex(d);
    const b = base[wd];
    const closed = b.n === 0 || b.expected === 0;
    const factors: Factor[] = [];
    let mult = 1;

    if (!closed) {
      if (isPaydayWindow(d) && calibPayday != null) {
        factors.push({ label: "Jour de paye", effect: calibPayday - 1, estimated: false });
        mult *= calibPayday;
      }
      const holidayName = holidayMap.get(d);
      if (holidayName && calibHoliday != null) {
        factors.push({ label: holidayName, effect: calibHoliday - 1, estimated: false });
        mult *= calibHoliday;
      }
      if (schoolRanges.some((r) => inRange(d, r)) && calibSchool != null) {
        factors.push({ label: "Vacances scolaires", effect: calibSchool - 1, estimated: false });
        mult *= calibSchool;
      }
      // Événements / promos : peu ou pas d'historique → estimation par direction
      // (assumée, marquée « estimated » pour l'honnêteté de l'explication).
      const nat = nationalRanges.find((r) => inRange(d, r));
      if (nat) {
        const m = nat.expected_effect === "down" ? 0.88 : 1.12;
        factors.push({ label: nat.label, effect: m - 1, estimated: true });
        mult *= m;
      }
      const loc = input.localEvents.find((r) => inRange(d, r));
      if (loc) {
        const m = loc.expected_effect === "down" ? 0.85 : 1.15;
        factors.push({ label: loc.label, effect: m - 1, estimated: true });
        mult *= m;
      }
      if (promoSet.has(d)) {
        const m = 1.15;
        factors.push({ label: "Promo programmée", effect: m - 1, estimated: true });
        mult *= m;
      }
    }

    mult = clamp(mult, 0.4, 2.2); // garde-fou : jamais d'empilement absurde
    days.push({
      date: d,
      weekdayLabel: WEEKDAYS[wd],
      closed,
      low: Math.round(b.low * mult),
      expected: Math.round(b.expected * mult),
      high: Math.round(b.high * mult),
      factors,
    });
  }

  const weekTotal = {
    low: days.reduce((s, d) => s + d.low, 0),
    expected: days.reduce((s, d) => s + d.expected, 0),
    high: days.reduce((s, d) => s + d.high, 0),
  };

  // 5. Niveau de confiance : volume d'historique + régularité (ADR 0027 §7).
  const activeSamples = base.filter((b) => b.n > 0).map((b) => b.n);
  const avgSamples = mean(activeSamples);
  const cv = coefficientOfVariation([...normalized.values()]);
  const order: ("low" | "medium" | "high")[] = ["low", "medium", "high"];
  let level: "low" | "medium" | "high" = weeksOfData >= 16 ? "high" : weeksOfData >= 8 ? "medium" : "low";
  const downgrade = () => {
    level = order[Math.max(0, order.indexOf(level) - 1)];
  };
  if (avgSamples < 3) downgrade(); // peu de semaines par jour de semaine
  if (cv > 0.5) downgrade(); // activité irrégulière
  const confidenceReason = buildConfidenceReason(weeksOfData, cv);

  return { status: "ok", confidence: level, confidenceReason, days, weekTotal, weeksOfData };
}

function buildConfidenceReason(weeksOfData: number, cv: number): string {
  const regularity = cv <= 0.3 ? "activité régulière" : cv <= 0.5 ? "activité assez régulière" : "activité irrégulière";
  return `${weeksOfData} semaine${weeksOfData > 1 ? "s" : ""} d'historique, ${regularity}.`;
}
