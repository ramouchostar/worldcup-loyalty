import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { getMission, logEvent } from "./missions";
import { getForProvider } from "./provider-missions";
import type { ProviderRow } from "./providers";
import { judgeReview, sanitizeReview, summarize, validateReview, type PublicReview, type ReviewDirection, type ReviewIssue, type ReviewSummary } from "./mission-reviews";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 decies, PR W) — les avis : écrire, lire, masquer.
//
// Un avis par mission et par sens (UNIQUE en base : deux clics n'en font qu'un), définitif. Le restaurateur note le prestataire
// (public, sans son nom) ; le prestataire note le restaurateur (privé, la plateforme seule le lit). FAIL-OPEN : migration
// 20261021-1200 absente → « unavailable », jamais un crash, jamais un avis perdu en silence.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

export type SubmitReviewResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_finished" | "already_reviewed" | "unavailable" }
  | { ok: false; reason: "invalid"; issues: ReviewIssue[] };

async function write(missionId: string, providerId: string, direction: ReviewDirection, userId: string | null, raw: unknown, status: string): Promise<SubmitReviewResult> {
  const input = sanitizeReview(raw);
  const check = validateReview(input);
  if (!check.ok) return { ok: false, reason: "invalid", issues: check.issues };
  try {
    const admin = createAdminClient();
    // L'état est jugé avant l'écriture ; l'unicité en base tranche si deux envois partent ensemble.
    const verdict = judgeReview(status, false);
    if (verdict !== "ok") return { ok: false, reason: verdict };
    const { error } = await admin.from("mission_reviews").insert({ mission_id: missionId, provider_id: providerId, direction, rating: input.rating, comment: input.comment, author_id: userId });
    if (error) {
      if (error.code === "23505") return { ok: false, reason: "already_reviewed" };
      throw error;
    }
    await logEvent(missionId, { kind: "review_left", actorKind: direction === "restaurant_to_provider" ? "restaurant" : "provider", actorId: userId ?? undefined, meta: { direction, rating: input.rating, hasComment: input.comment.length > 0 } });
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-reviews] write failed:", (e as Error).message);
    return unavailable;
  }
}

/** Le restaurateur note le prestataire de SA mission (public, sans son nom). */
export async function reviewProvider(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<SubmitReviewResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m || !m.provider_id) return { ok: false, reason: "not_found" };
  return write(missionId, m.provider_id, "restaurant_to_provider", userId, raw, m.status);
}

/** Le prestataire note le restaurateur de SA mission (privé). */
export async function reviewRestaurant(missionId: string, provider: ProviderRow, raw: unknown): Promise<SubmitReviewResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  if (!found.mission) return { ok: false, reason: "not_found" };
  return write(missionId, provider.id, "provider_to_restaurant", provider.user_id, raw, found.mission.status);
}

// ── Lire ─────────────────────────────────────────────────────

/** Qui a déjà noté cette mission, par sens (pour montrer ou cacher la carte). Migration absente → null (aucune carte). */
export async function reviewedDirections(missionId: string): Promise<{ restaurant_to_provider: boolean; provider_to_restaurant: boolean } | null> {
  try {
    const { data, error } = await createAdminClient().from("mission_reviews").select("direction").eq("mission_id", missionId);
    if (error) throw error;
    const done = new Set(((data ?? []) as { direction: ReviewDirection }[]).map((r) => r.direction));
    return { restaurant_to_provider: done.has("restaurant_to_provider"), provider_to_restaurant: done.has("provider_to_restaurant") };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-reviews] reviewedDirections failed:", (e as Error).message);
    return null;
  }
}

/** Ce que lisent les restaurateurs sur le profil d'un prestataire : avis visibles seulement, jamais les notes privées. */
export async function providerReviewSummary(providerId: string): Promise<ReviewSummary | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("mission_reviews")
      .select("rating, comment, created_at")
      .eq("provider_id", providerId)
      .eq("direction", "restaurant_to_provider")
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return summarize(((data ?? []) as { rating: number; comment: string; created_at: string }[]).map((r): PublicReview => ({ rating: r.rating, comment: r.comment, at: r.created_at })));
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-reviews] providerReviewSummary failed:", (e as Error).message);
    return null;
  }
}

export type PlatformReview = {
  id: string;
  missionId: string;
  direction: ReviewDirection;
  rating: number;
  comment: string;
  createdAt: string;
  hiddenAt: string | null;
  restaurantName: string;
  providerName: string;
};

/** Tous les avis, privés compris (plateforme seule). `missionId` : ceux d'une mission. */
export async function listAllReviews(missionId?: string): Promise<{ ok: true; reviews: PlatformReview[] } | typeof unavailable> {
  try {
    let q = createAdminClient()
      .from("mission_reviews")
      .select("id, mission_id, direction, rating, comment, created_at, hidden_at, missions(restaurants(name)), providers(display_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (missionId) q = q.eq("mission_id", missionId);
    const { data, error } = await q;
    if (error) throw error;
    type Row = { id: string; mission_id: string; direction: ReviewDirection; rating: number; comment: string; created_at: string; hidden_at: string | null; missions: { restaurants: { name: string } | null } | null; providers: { display_name: string } | null };
    return {
      ok: true,
      reviews: ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        missionId: r.mission_id,
        direction: r.direction,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        hiddenAt: r.hidden_at,
        restaurantName: r.missions?.restaurants?.name ?? "Restaurant",
        providerName: r.providers?.display_name ?? "Prestataire",
      })),
    };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-reviews] listAllReviews failed:", (e as Error).message);
    return unavailable;
  }
}

/** La plateforme masque (ou rétablit) un avis. Tracé avec qui l'a fait. */
export async function setReviewHidden(reviewId: string, hidden: boolean, platformUserId: string): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("mission_reviews")
      .update({ hidden_at: hidden ? new Date().toISOString() : null, hidden_by: hidden ? platformUserId : null })
      .eq("id", reviewId)
      .select("mission_id");
    if (error) throw error;
    const row = (data ?? [])[0] as { mission_id: string } | undefined;
    if (!row) return { ok: false };
    await logEvent(row.mission_id, { kind: hidden ? "review_hidden" : "review_restored", actorKind: "platform", actorId: platformUserId, meta: { reviewId } });
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-reviews] setReviewHidden failed:", (e as Error).message);
    return { ok: false };
  }
}
