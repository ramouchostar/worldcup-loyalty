import type { Barometer, BarometerState, BarometerTrend, FeedbackDimension } from "@/types";

// ADR 0023 §8 — Baromètre de confiance : ÉTAT + TENDANCE + DÉCOMPOSITION,
// jamais une note chiffrée. Sous un seuil de retours → « pas assez de signaux »
// (état 'insufficient'). La tendance compare la période courante à la
// précédente ; 'up' = ça s'améliore (moins d'incidents).

const INSUFFICIENT_MIN = 5; // volume minimal pour afficher un état
const WINDOW_DAYS = 30;     // fenêtre d'une période
const TREND_EPS = 0.05;     // zone morte pour éviter un yo-yo de tendance

export type BarometerInput = {
  sentiment: "encouragement" | "incident";
  status: "new" | "acknowledged" | "resolved";
  dimensions: FeedbackDimension[];
  createdAt: string;
};

function incidentRate(items: BarometerInput[]): number {
  if (items.length === 0) return 0;
  const inc = items.filter((i) => i.sentiment === "incident").length;
  return inc / items.length;
}

function stateFromRate(rate: number): Exclude<BarometerState, "insufficient"> {
  if (rate <= 0.15) return "good";
  if (rate <= 0.4) return "watch";
  return "tense";
}

export function computeBarometer(current: BarometerInput[], previous: BarometerInput[]): Barometer {
  const encouragements = current.filter((i) => i.sentiment === "encouragement").length;
  const incidents = current.filter((i) => i.sentiment === "incident").length;
  const unresolved = current.filter((i) => i.sentiment === "incident" && i.status === "new").length;
  const total = current.length;

  // Axes récurrents (uniquement sur les incidents).
  const dimCounts = new Map<FeedbackDimension, number>();
  for (const i of current) {
    if (i.sentiment !== "incident") continue;
    for (const d of i.dimensions ?? []) dimCounts.set(d, (dimCounts.get(d) ?? 0) + 1);
  }
  const topDimensions = Array.from(dimCounts.entries())
    .map(([dimension, count]) => ({ dimension, count }))
    .sort((a, b) => b.count - a.count);

  let state: BarometerState;
  let trend: BarometerTrend;

  if (total < INSUFFICIENT_MIN) {
    state = "insufficient";
    trend = "na";
  } else {
    state = stateFromRate(incidentRate(current));
    if (previous.length < INSUFFICIENT_MIN) {
      trend = "na";
    } else {
      const cur = incidentRate(current);
      const prev = incidentRate(previous);
      trend = cur < prev - TREND_EPS ? "up" : cur > prev + TREND_EPS ? "down" : "flat";
    }
  }

  return { state, trend, encouragements, incidents, unresolved, topDimensions, totalFeedback: total };
}

// Découpe une liste de retours en période courante / précédente (fenêtres de
// WINDOW_DAYS) et calcule le baromètre. `now` injecté pour rester testable.
export function barometerFromItems(items: BarometerInput[], now: Date): Barometer {
  const cutCurrent = now.getTime() - WINDOW_DAYS * 86_400_000;
  const cutPrevious = now.getTime() - 2 * WINDOW_DAYS * 86_400_000;
  const current: BarometerInput[] = [];
  const previous: BarometerInput[] = [];
  for (const i of items) {
    const t = new Date(i.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= cutCurrent) current.push(i);
    else if (t >= cutPrevious) previous.push(i);
  }
  return computeBarometer(current, previous);
}
