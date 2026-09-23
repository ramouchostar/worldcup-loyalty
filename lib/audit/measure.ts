// ADR 0068 — mesurer un établissement : fiche (volet A) et avis (volet D).
//
// Aucune écriture en base ici : `measure()` renvoie tout ce qu'il faut
// enregistrer (volets, notes, signaux, recommandations, coût), l'appelant le
// persiste (console : lib/audit/store.ts ; test local : scripts/audit-run.mjs).
// Chaque volet réussit ou échoue seul, avec son motif.

import {
  DataForSeoError,
  fetchBusinessInfo,
  getReviews,
  isConfigured,
  postReviewsTask,
  type BusinessInfo,
  type StoredReview,
  type Target,
} from "./dataforseo";
import { scoreFiche, type FicheScore } from "./fiche-score";
import { recommend, type Recommendations } from "./recommend";
import { findBreakpoint, monthlySeries, ownerResponses, trendOf, type Breakpoint, type MonthPoint, type OwnerResponses } from "./reviews-analysis";
import { ratingBand, type AuditSignals } from "./signals";

export type SectionOutcome<T> =
  | { status: "ok"; source: string; raw: unknown; result: T; cost: number }
  | { status: "echec" | "non_branche"; source: string; error: string; cost: number };

export interface ReviewsResultSummary {
  total: number | null;
  read: number;
  monthly: MonthPoint[];
  breakpoint: Breakpoint | null;
  responses: OwnerResponses;
  distribution: Record<string, number>;
}

export interface Measured {
  fiche: SectionOutcome<{ info: BusinessInfo; score: FicheScore }>;
  avis: SectionOutcome<ReviewsResultSummary>;
  signals: AuditSignals;
  recommendations: Recommendations;
  scores: { fiche: number | null; avis: number | null };
  costUsd: number;
  calls: Record<string, number>;
}

const REVIEWS_POLL_MS = 10_000;
const REVIEWS_MAX_WAIT_MS = 4 * 60_000;

const reason = (e: unknown) => (e instanceof DataForSeoError ? `DataForSEO ${e.code ?? ""} : ${e.message}` : e instanceof Error ? e.message : String(e));

async function readReviews(target: Target, calls: Record<string, number>): Promise<{ reviews: StoredReview[]; total: number | null; cost: number }> {
  calls.dataforseo += 1;
  const id = await postReviewsTask(target);
  const start = Date.now();
  while (Date.now() - start < REVIEWS_MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, REVIEWS_POLL_MS));
    calls.dataforseo += 1;
    const res = await getReviews(id);
    if (res.ready) return res;
  }
  throw new Error(`Avis toujours en attente après ${REVIEWS_MAX_WAIT_MS / 60_000} min (tâche ${id}).`);
}

/** Note du volet Avis sur 100 : note moyenne, tendance, réponses. */
export function scoreReviews(rating: number | null, s: ReviewsResultSummary, trend: AuditSignals["trend"]): number | null {
  if (rating == null) return null;
  const note = Math.max(0, Math.min(1, (rating - 3.5) / 1.3)) * 50; // 3,5★ → 0 ; 4,8★ → 50
  const tendance = trend == null ? null : trend === "hausse" ? 20 : trend === "stable" ? 14 : 4;
  const reponses = s.responses.share == null ? null : Math.min(1, s.responses.share / 0.8) * 30;
  const parts = [[note, 50], [tendance, 20], [reponses, 30]] as const;
  const known = parts.filter(([v]) => v != null);
  const max = known.reduce((a, [, m]) => a + m, 0);
  return Math.round((known.reduce((a, [v]) => a + (v as number), 0) / max) * 100);
}

export async function measure(target: Target, now = new Date()): Promise<Measured> {
  const calls: Record<string, number> = { dataforseo: 0 };
  if (!isConfigured()) {
    const off = { status: "non_branche" as const, source: "dataforseo", error: "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD absents.", cost: 0 };
    const signals = emptySignals();
    return { fiche: off, avis: off, signals, recommendations: recommend(signals), scores: { fiche: null, avis: null }, costUsd: 0, calls };
  }

  const [infoRes, reviewsRes] = await Promise.allSettled([fetchBusinessInfo(target), readReviews(target, calls)]);
  calls.dataforseo += 1; // la fiche

  const info = infoRes.status === "fulfilled" ? infoRes.value.info : null;
  const reviews = reviewsRes.status === "fulfilled" ? reviewsRes.value : null;

  // Volet D
  let avis: Measured["avis"];
  let trend: AuditSignals["trend"] = null;
  let responses: OwnerResponses | null = null;
  if (reviews) {
    responses = ownerResponses(reviews.reviews, now);
    trend = trendOf(reviews.reviews, now);
    const distribution: Record<string, number> = {};
    for (const r of reviews.reviews) if (r.rating != null) distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
    avis = {
      status: "ok",
      source: "dataforseo",
      raw: { reviews: reviews.reviews },
      result: {
        total: reviews.total,
        read: reviews.reviews.length,
        monthly: monthlySeries(reviews.reviews),
        breakpoint: findBreakpoint(reviews.reviews),
        responses,
        distribution,
      },
      cost: reviews.cost,
    };
  } else {
    avis = { status: "echec", source: "dataforseo", error: reason((reviewsRes as PromiseRejectedResult).reason), cost: 0 };
  }

  // Volet A
  let fiche: Measured["fiche"];
  if (info) {
    const score = scoreFiche(info, {
      rating: info.rating?.value ?? null,
      reviewsCount: info.rating?.votes_count ?? null,
      competitorMedianReviews: null, // volet C (PR 3)
      responseShare: responses?.share ?? null,
      medianDelayDays: responses?.medianDelayDays ?? null,
    });
    fiche = { status: "ok", source: "dataforseo", raw: info, result: { info, score }, cost: infoRes.status === "fulfilled" ? infoRes.value.cost : 0 };
  } else {
    fiche = {
      status: "echec",
      source: "dataforseo",
      error: infoRes.status === "rejected" ? reason(infoRes.reason) : "Aucune fiche trouvée pour cet établissement.",
      cost: 0,
    };
  }

  const rating = info?.rating?.value ?? null;
  const signals: AuditSignals = {
    ...emptySignals(),
    rating: ratingBand(rating),
    trend,
    responseRate: responses?.level ?? null,
    ficheGaps: fiche.status === "ok" ? fiche.result.score.gaps : [],
  };
  const scores = {
    fiche: fiche.status === "ok" ? fiche.result.score.score : null,
    avis: avis.status === "ok" ? scoreReviews(rating, avis.result, trend) : null,
  };
  return {
    fiche,
    avis,
    signals,
    recommendations: recommend(signals),
    scores,
    costUsd: Math.round((fiche.cost + avis.cost) * 10000) / 10000,
    calls,
  };
}

export function emptySignals(): AuditSignals {
  return {
    rating: null, trend: null, reviewVolume: null, responseRate: null, negativeThemes: [], ficheGaps: [],
    gapsCoveredByCompetitors: [], instagram: null, tiktok: null, channelMix: null, heroMargin: null,
    prepSpeed: null, revenueGap: null, price: null, position: null,
  };
}
