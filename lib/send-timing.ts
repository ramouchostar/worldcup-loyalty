// Lecture des heures d'envoi (ADR 0077 §4) — pure, testée. La page
// /platform/messages s'en sert pour dire, par créneau, si un restaurateur
// clique, et pour ne RIEN conclure tant que les envois sont trop peu
// nombreux : avec quelques envois, le hasard désignerait un « gagnant ».

import { brusselsClock, SEND_SLOTS } from "./pro-sequence-rules";

export const MIN_SENDS_PER_SLOT = 30;
export const MIN_CLICKS_BEST = 10;

export type TimedSend = {
  slot: number | null;
  channel: string;
  status: string;
  createdAt: string;
  clickedAt: string | null;
};

export type SlotSummary = {
  slot: number;
  sends: number;
  clicks: number;
  rate: number | null; // pourcentage entier, null sans envoi
  medianDelayMin: number | null; // délai médian entre l'envoi et le clic
};

// Un envoi qui a vraiment pu être lu : ni échec, ni témoin.
function reached(s: TimedSend): boolean {
  return s.status !== "failed" && s.status !== "holdout";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function summarizeSlots(sends: TimedSend[], channel?: string): SlotSummary[] {
  return SEND_SLOTS.map((slot) => {
    const mine = sends.filter((s) => s.slot === slot && reached(s) && (!channel || s.channel === channel));
    const clicked = mine.filter((s) => s.clickedAt);
    const delays = clicked.map((s) => (new Date(s.clickedAt!).getTime() - new Date(s.createdAt).getTime()) / 60_000).filter((d) => d >= 0);
    return {
      slot,
      sends: mine.length,
      clicks: clicked.length,
      rate: mine.length ? Math.round((clicked.length / mine.length) * 100) : null,
      medianDelayMin: delays.length ? Math.round(median(delays)!) : null,
    };
  });
}

export type Verdict =
  | { kind: "wait"; totalSends: number; missingSlots: number }
  | { kind: "best"; slot: number; rate: number };

/** Une conclusion seulement quand chaque créneau a assez d'envois et le meilleur assez de clics. */
export function timingVerdict(summary: SlotSummary[]): Verdict {
  const totalSends = summary.reduce((n, s) => n + s.sends, 0);
  const missingSlots = summary.filter((s) => s.sends < MIN_SENDS_PER_SLOT).length;
  const best = [...summary].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.clicks - a.clicks)[0];
  if (missingSlots > 0 || !best || best.clicks < MIN_CLICKS_BEST || best.rate === null) {
    return { kind: "wait", totalSends, missingSlots };
  }
  return { kind: "best", slot: best.slot, rate: best.rate };
}

/** Clics par heure de Bruxelles (0-23) — quand les gens cliquent, quelle que soit l'heure d'envoi. */
export function clicksByHour(sends: TimedSend[]): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  for (const s of sends) {
    if (!s.clickedAt) continue;
    out[Math.floor(brusselsClock(new Date(s.clickedAt)).hhmm / 100)] += 1;
  }
  return out;
}

/** Ouvertures de la console par heure (0-23), cumulées sur la période lue. */
export function visitsByHour(rows: { hour: number; visits: number }[]): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  for (const r of rows) if (r.hour >= 0 && r.hour < 24) out[r.hour] += r.visits;
  return out;
}

export function formatDelay(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
