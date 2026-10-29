import type { OpenObjective } from "./meta-spec";

// ADR 0086 amendé le 2026-10-29 (démo De Bue) — ce qu'une pub peut donner, AVANT de payer.
// Module PUR et testé. Meta ne donne plus de courbe « budget → résultats » par l'API
// (constaté le 2026-10-29 : `delivery_estimate` ne renvoie que la taille de l'audience,
// même sur un ensemble réel en pause) : on calcule donc nous-mêmes, à partir de coûts
// constatés, en FOURCHETTE, et la portée est plafonnée par l'audience que Meta donne.
//
// Coûts de départ = campagnes réelles du compte BOOSTEATS (Houba, avril-mai 2026) :
// notoriété 472 € → 626 862 impressions, 153 272 personnes, CPM 0,75 €, fréquence 4,1 ;
// prospects 12,86 € → 33 clics, 0,39 € le clic (petit échantillon : fourchette large).
// Dès que nos campagnes ont assez dépensé, `calibrate` les remplace (lib/ads/requests.ts).

export type Benchmark = {
  /** Coût pour mille impressions, en euros : [bas, haut]. */
  cpm: [number, number];
  /** Coût d'un clic sur le lien, en euros : [bas, haut] (TRAFIC). */
  cpc: [number, number];
  /** Combien de fois une personne voit la pub sur la période, en moyenne. */
  frequency: [number, number];
};

export const DEFAULT_BENCHMARKS: Record<OpenObjective, Benchmark> = {
  NOTORIETE: { cpm: [0.7, 1.5], cpc: [3, 7], frequency: [2.5, 4] },
  TRAFIC: { cpm: [2, 5], cpc: [0.35, 1], frequency: [1.5, 2.5] },
  VIDEO: { cpm: [1, 3], cpc: [2, 6], frequency: [2.5, 4] },
};

/** Dépense minimale de nos propres campagnes pour qu'elles remplacent les coûts de départ. */
export const CALIBRATION_MIN_SPEND_CENTS = 50_00;

export type Observed = { spendCents: number; impressions: number; clicks: number };

/**
 * Remplace le point central des coûts par ce que nos campagnes ont réellement coûté,
 * en gardant l'écart relatif de la fourchette. Sous le seuil de dépense : inchangé.
 */
export function calibrate(base: Benchmark, observed: Observed | null): { benchmark: Benchmark; calibrated: boolean } {
  if (!observed || observed.spendCents < CALIBRATION_MIN_SPEND_CENTS || observed.impressions === 0) return { benchmark: base, calibrated: false };
  const euros = observed.spendCents / 100;
  const around = (range: [number, number], value: number): [number, number] => {
    const mid = (range[0] + range[1]) / 2;
    return [round2((range[0] / mid) * value), round2((range[1] / mid) * value)];
  };
  const cpm = around(base.cpm, (euros / observed.impressions) * 1000);
  const cpc = observed.clicks >= 20 ? around(base.cpc, euros / observed.clicks) : base.cpc;
  return { benchmark: { ...base, cpm, cpc }, calibrated: true };
}

export type Estimate = {
  /** Ce qu'on estime : personnes touchées, clics ou impressions. */
  kind: "reach" | "clicks" | "impressions";
  lo: number;
  hi: number;
  /** Vues par personne (notoriété et vidéo). */
  frequency: number | null;
  /** Personnes qui vivent ou passent dans la zone (Meta), si connue. */
  audience: number | null;
  calibrated: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Arrondi lisible : 1 234 → 1 200, 87 654 → 88 000. */
export function roundNice(n: number): number {
  if (n < 100) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

export function estimateResults(p: {
  objective: OpenObjective;
  budgetCents: number;
  audience: { lo: number; hi: number } | null;
  benchmark: Benchmark;
  calibrated?: boolean;
}): Estimate {
  const euros = p.budgetCents / 100;
  const b = p.benchmark;
  const impressions: [number, number] = [(euros / b.cpm[1]) * 1000, (euros / b.cpm[0]) * 1000];
  const base = { audience: p.audience ? p.audience.hi : null, calibrated: p.calibrated ?? false };

  if (p.objective === "TRAFIC") {
    return { kind: "clicks", lo: roundNice(euros / b.cpc[1]), hi: roundNice(euros / b.cpc[0]), frequency: null, ...base };
  }
  if (p.objective === "VIDEO") {
    return { kind: "impressions", lo: roundNice(impressions[0]), hi: roundNice(impressions[1]), frequency: round1((b.frequency[0] + b.frequency[1]) / 2), ...base };
  }
  // NOTORIETE : la portée, plafonnée par l'audience de la zone.
  const cap = p.audience ? p.audience.lo : Infinity;
  const lo = Math.min(impressions[0] / b.frequency[1], cap);
  const hi = Math.min(impressions[1] / b.frequency[0], cap);
  return { kind: "reach", lo: roundNice(lo), hi: roundNice(Math.max(lo, hi)), frequency: round1((b.frequency[0] + b.frequency[1]) / 2), ...base };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Le budget par jour ───────────────────────────────────────

/** Repère donné en démo le 2026-10-28 : 10 à 15 € par jour. Sous 5 €, la pub se voit à peine. */
export const DAILY_ADVICE = { tooLowCents: 5_00, lowCents: 10_00, highCents: 15_00 } as const;
export type DailyAdvice = "too_low" | "low" | "ok" | "high";

export function dailyAdvice(dailyCents: number): DailyAdvice {
  if (dailyCents < DAILY_ADVICE.tooLowCents) return "too_low";
  if (dailyCents < DAILY_ADVICE.lowCents) return "low";
  if (dailyCents <= DAILY_ADVICE.highCents) return "ok";
  return "high";
}

export const DAILY_ADVICE_TEXT: Record<DailyAdvice, string> = {
  too_low: "Trop peu par jour pour être vu : augmente le budget ou raccourcis la période.",
  low: "Un peu sous le repère conseillé (10 à 15 € par jour) : ça tourne, plus doucement.",
  ok: "Dans le repère conseillé (10 à 15 € par jour).",
  high: "Au-dessus du repère (10 à 15 € par jour) : plus de répétition dans la même zone.",
};

// ── Les raccourcis de période ────────────────────────────────

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la 2e semaine d'un mois (« le milieu du mois »), puis 14 jours. */
function weeks2and3(year: number, month0: number): { startsOn: string; endsOn: string } {
  const first = new Date(Date.UTC(year, month0, 1, 12));
  const toMonday = (8 - first.getUTCDay()) % 7; // 0 si le 1er est un lundi
  const firstMonday = new Date(first);
  firstMonday.setUTCDate(1 + toMonday);
  const start = firstMonday.toISOString().slice(0, 10);
  const startsOn = addDays(start, 7);
  return { startsOn, endsOn: addDays(startsOn, 13) };
}

export type PeriodPreset = { label: string; startsOn: string; endsOn: string };

/**
 * « Les 2 prochaines semaines » (dès demain) et « Semaines 2 et 3 de <mois> » — le mois
 * en cours si ce créneau commence après demain, sinon le suivant.
 */
export function periodPresets(today: string): PeriodPreset[] {
  const tomorrow = addDays(today, 1);
  const out: PeriodPreset[] = [{ label: "Les 2 prochaines semaines", startsOn: tomorrow, endsOn: addDays(tomorrow, 13) }];
  const [y, m] = today.split("-").map(Number);
  let mid = weeks2and3(y, m - 1);
  let month = m - 1;
  let year = y;
  if (mid.startsOn < tomorrow) {
    month = (m) % 12;
    year = m === 12 ? y + 1 : y;
    mid = weeks2and3(year, month);
  }
  out.push({ label: `Semaines 2 et 3 de ${MONTHS[month]}`, ...mid });
  return out;
}
