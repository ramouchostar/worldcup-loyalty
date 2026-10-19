import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { getMission, logEvent, type MissionRow } from "./missions";
import { getForProvider } from "./provider-missions";
import type { ProviderRow } from "./providers";
import { getPlan } from "./entitlements";
import { getTerms } from "./marketplace-settings";
import { priceBreakdown, type Metier } from "./mission-money";
import { mailMission as mail } from "./missions-notify";
import { changeableStatuses } from "./mission-metier";
import { linkFiles } from "./missions-files-link";
import { sanitizeIds, MAX_UNLINKED } from "./mission-files";
import { CHANGE_COLUMNS, listChanges, type ChangeRow } from "./missions-changes-state";
import {
  judgeChangeRequest,
  judgeProviderAnswer,
  judgeRestaurantAnswer,
  sanitizeChangeQuote,
  sanitizeChangeRequest,
  sanitizeReason,
  shouldExpire,
  validateChangeQuote,
  validateChangeRequest,
  validateReason,
  canWithdraw,
  type ChangeQuoteIssue,
  type RequestIssue,
  type RequestVerdict,
} from "./mission-changes";

// ============================================================
// Réserver un prestataire (ADR 0084 §3 règle 9, PR M) — la demande de modification : demander, chiffrer ou refuser,
// accepter ou refuser le supplément, retirer, expirer.
//
// Les règles vivent dans lib/mission-changes.ts (pures, testées) ; ce fichier les applique à Supabase. Chaque passage est
// un compare-and-swap sur l'état de la demande (un double clic ne chiffre ni n'accepte deux fois), laisse sa ligne
// dans `mission_events`, et chaque e-mail a son issue tracée. À l'acceptation, le supplément est FIGÉ avec le plan et
// les conditions du moment, et les montants de la mission sont augmentés. FAIL-OPEN : migration 20261013-1400 absente →
// « unavailable », rien n'est écrit à moitié.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

// ── Le restaurateur demande ──────────────────────────────────

export type RequestResult =
  | { ok: true; seq: number }
  | { ok: false; reason: "not_found" | "unavailable" }
  | { ok: false; reason: "refused"; verdict: Exclude<RequestVerdict, "ok"> }
  | { ok: false; reason: "invalid"; issues: RequestIssue[] };

export async function requestChange(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<RequestResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  const list = await listChanges(missionId);
  if (!list.ok) return unavailable;

  const verdict = judgeChangeRequest({ status: m.status, shootDate: m.shoot_date, changes: list.changes, metier: m.metier }, todayInBrussels());
  if (verdict !== "ok") {
    await logEvent(missionId, { kind: "change_refused", actorKind: "restaurant", actorId: userId, reason: verdict });
    return { ok: false, reason: "refused", verdict };
  }
  const ids = sanitizeIds((raw as { attachmentIds?: unknown } | null)?.attachmentIds, MAX_UNLINKED.change);
  const input = sanitizeChangeRequest(raw, ids);
  const check = validateChangeRequest(input);
  if (!check.ok) {
    await logEvent(missionId, { kind: "change_refused", actorKind: "restaurant", actorId: userId, reason: "invalid", meta: { issues: check.issues.map((i) => `${i.field}:${i.code}`) } });
    return { ok: false, reason: "invalid", issues: check.issues };
  }

  try {
    const seq = list.changes.reduce((n, c) => Math.max(n, c.seq), 0) + 1;
    const { error } = await createAdminClient().from("mission_changes").insert({ mission_id: missionId, seq, categories: input.categories, description: input.description, requested_by: userId });
    if (error) {
      // L'index unique : une autre demande est ouverte (deux clics en même temps), ou le même numéro vient d'être pris.
      if (error.code === "23505") return { ok: false, reason: "refused", verdict: "open_exists" };
      throw error;
    }
    const linked = await linkFiles(missionId, "change", "restaurant", input.files, `change-${seq}`);
    await logEvent(missionId, { kind: "change_requested", actorKind: "restaurant", actorId: userId, meta: { seq, categories: input.categories, files: linked } });
    await mail(missionId, "provider", "change_requested");
    return { ok: true, seq };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-changes] requestChange failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Le prestataire chiffre ou refuse ─────────────────────────

async function loadOne(missionId: string, changeId: string): Promise<ChangeRow | null> {
  const { data, error } = await createAdminClient().from("mission_changes").select(CHANGE_COLUMNS).eq("id", changeId).eq("mission_id", missionId).maybeSingle();
  if (error) throw error;
  return (data as ChangeRow | null) ?? null;
}

export type QuoteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_expected" | "unavailable" }
  | { ok: false; reason: "invalid"; issues: ChangeQuoteIssue[] };

export async function quoteChange(missionId: string, provider: ProviderRow, changeId: string, raw: unknown): Promise<QuoteResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  if (!found.mission) return { ok: false, reason: "not_found" };
  try {
    const c = await loadOne(missionId, changeId);
    if (!c) return { ok: false, reason: "not_found" };
    if (judgeProviderAnswer(c.status) !== "ok") return { ok: false, reason: "not_expected" };
    const q = sanitizeChangeQuote(raw);
    const check = validateChangeQuote(q);
    if (!check.ok) {
      await logEvent(missionId, { kind: "change_quote_refused", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "invalid", meta: { seq: c.seq, issues: check.issues.map((i) => `${i.field}:${i.code}`) } });
      return { ok: false, reason: "invalid", issues: check.issues };
    }
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("mission_changes")
      .update({ status: "quoted", supplement_cents: q.priceCents, delta_days: q.deltaDays, provider_note: q.note || null, quoted_at: now })
      .eq("id", changeId)
      .eq("status", "proposed") // deux clics : un seul chiffrage
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "not_expected" };
    await logEvent(missionId, { kind: "change_quoted", actorKind: "provider", actorId: provider.user_id ?? undefined, meta: { seq: c.seq, free: q.free, supplementCents: q.priceCents, deltaDays: q.deltaDays } });
    await mail(missionId, "restaurant", "change_quoted", { free: q.free });
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-changes] quoteChange failed:", (e as Error).message);
    return unavailable;
  }
}

export type DeclineResult = { ok: true } | { ok: false; reason: "not_found" | "not_expected" | "reason_short" | "reason_long" | "unavailable" };

export async function declineChange(missionId: string, provider: ProviderRow, changeId: string, raw: unknown): Promise<DeclineResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  if (!found.mission) return { ok: false, reason: "not_found" };
  try {
    const c = await loadOne(missionId, changeId);
    if (!c) return { ok: false, reason: "not_found" };
    if (judgeProviderAnswer(c.status) !== "ok") return { ok: false, reason: "not_expected" };
    const reason = sanitizeReason(raw);
    const v = validateReason(reason);
    if (v !== "ok") return { ok: false, reason: v === "too_short" ? "reason_short" : "reason_long" };
    const { data, error } = await createAdminClient()
      .from("mission_changes")
      .update({ status: "declined_by_provider", decline_reason: reason, decided_at: new Date().toISOString() })
      .eq("id", changeId)
      .eq("status", "proposed")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "not_expected" };
    await logEvent(missionId, { kind: "change_declined", actorKind: "provider", actorId: provider.user_id ?? undefined, meta: { seq: c.seq } });
    await mail(missionId, "restaurant", "change_provider_declined");
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-changes] declineChange failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Le restaurateur répond au supplément ─────────────────────

export type AnswerResult = { ok: true } | { ok: false; reason: "not_found" | "not_expected" | "too_late" | "unavailable" };

/** « accept » fige le supplément et augmente les montants de la mission ; « decline » garde le brief d'origine ; « withdraw » retire la demande. */
export async function answerChange(missionId: string, restaurantId: string, userId: string, changeId: string, answer: unknown): Promise<AnswerResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  try {
    const c = await loadOne(missionId, changeId);
    if (!c) return { ok: false, reason: "not_found" };
    if (!changeableStatuses(m.metier).includes(m.status)) return { ok: false, reason: "not_expected" };
    if (answer === "withdraw") return withdraw(m, c, userId);
    if (answer !== "accept" && answer !== "decline") return { ok: false, reason: "not_expected" };
    const verdict = judgeRestaurantAnswer(c.status, m.shoot_date, todayInBrussels());
    if (verdict !== "ok") return { ok: false, reason: verdict };
    return answer === "accept" ? accept(m, c, userId) : decline(m, c, userId);
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-changes] answerChange failed:", (e as Error).message);
    return unavailable;
  }
}

async function withdraw(m: MissionRow, c: ChangeRow, userId: string): Promise<AnswerResult> {
  if (!canWithdraw(c.status)) return { ok: false, reason: "not_expected" };
  const { data, error } = await createAdminClient().from("mission_changes").update({ status: "withdrawn", decided_at: new Date().toISOString() }).eq("id", c.id).in("status", ["proposed", "quoted"]).select("id");
  if (error) throw error;
  if (!data || data.length === 0) return { ok: false, reason: "not_expected" };
  await logEvent(m.id, { kind: "change_withdrawn", actorKind: "restaurant", actorId: userId, meta: { seq: c.seq } });
  await mail(m.id, "provider", "change_withdrawn");
  return { ok: true };
}

async function decline(m: MissionRow, c: ChangeRow, userId: string): Promise<AnswerResult> {
  const { data, error } = await createAdminClient().from("mission_changes").update({ status: "declined_by_restaurant", decided_at: new Date().toISOString() }).eq("id", c.id).eq("status", "quoted").select("id");
  if (error) throw error;
  if (!data || data.length === 0) return { ok: false, reason: "not_expected" };
  await logEvent(m.id, { kind: "change_declined_by_restaurant", actorKind: "restaurant", actorId: userId, meta: { seq: c.seq } });
  await mail(m.id, "provider", "change_restaurant_declined");
  return { ok: true };
}

async function accept(m: MissionRow, c: ChangeRow, userId: string): Promise<AnswerResult> {
  const admin = createAdminClient();
  const supplement = c.supplement_cents ?? 0;
  // Les conditions EN VIGUEUR à cet instant, figées sur la demande : un réglage changé plus tard ne la touche pas.
  const { terms } = await getTerms();
  const plan = await getPlan(m.restaurant_id);
  const b = priceBreakdown(supplement, plan, terms);

  // 1. RÉSERVER : la demande passe à « acceptée » (une seule fois), avec ses montants figés.
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("mission_changes")
    .update({ status: "accepted", decided_at: now, plan_at_accept: plan, paid_cents: b.paidCents, provider_cents: b.providerCents, platform_cents: b.platformCents })
    .eq("id", c.id)
    .eq("status", "quoted")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) return { ok: false, reason: "not_expected" };

  // 2. AUGMENTER les montants de la mission, par compare-and-swap sur les valeurs lues (jamais d'écriture à l'aveugle).
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    const { data: cur, error: e1 } = await admin.from("missions").select("quote_cents, paid_cents, provider_cents, platform_cents").eq("id", m.id).maybeSingle();
    if (e1) throw e1;
    const t = cur as { quote_cents: number | null; paid_cents: number | null; provider_cents: number | null; platform_cents: number | null } | null;
    if (!t) break;
    let q = admin
      .from("missions")
      .update({
        quote_cents: (t.quote_cents ?? 0) + b.quoteCents,
        paid_cents: (t.paid_cents ?? 0) + b.paidCents,
        provider_cents: (t.provider_cents ?? 0) + b.providerCents,
        platform_cents: (t.platform_cents ?? 0) + b.platformCents,
        updated_at: now,
      })
      .eq("id", m.id)
      .in("status", [...changeableStatuses(m.metier)]);
    for (const col of ["quote_cents", "paid_cents", "provider_cents", "platform_cents"] as const) q = t[col] === null ? q.is(col, null) : q.eq(col, t[col] as number);
    const { data: moved, error: e2 } = await q.select("id");
    if (e2) throw e2;
    done = !!moved && moved.length > 0;
  }
  if (!done) {
    // Les montants n'ont pas pu être mis à jour : la demande n'est PAS acceptée, le restaurateur peut réessayer.
    await admin.from("mission_changes").update({ status: "quoted", decided_at: null, plan_at_accept: null, paid_cents: null, provider_cents: null, platform_cents: null }).eq("id", c.id).eq("status", "accepted");
    await logEvent(m.id, { kind: "change_accept_failed", actorKind: "system", reason: "totals_not_updated", meta: { seq: c.seq } });
    return { ok: false, reason: "unavailable" };
  }

  await logEvent(m.id, { kind: "change_accepted", actorKind: "restaurant", actorId: userId, meta: { seq: c.seq, plan, supplementCents: supplement, paidCents: b.paidCents, providerCents: b.providerCents, deltaDays: c.delta_days ?? 0 } });
  const free = supplement === 0;
  await mail(m.id, "provider", "change_accepted", { free });
  if (!free) await mail(m.id, "platform", "change_accepted");
  return { ok: true };
}

// ── Le passage quotidien : les demandes qui expirent ─────────

export type ChangesRun = { ok: false } | { ok: true; open: number; expired: number };

type OpenRow = { id: string; mission_id: string; seq: number; status: ChangeRow["status"]; created_at: string; missions: { shoot_date: string | null; status: string; metier: Metier } | null };

/** Une demande expire quand le prestataire n'a pas répondu en 3 jours, ou que la fenêtre de J-7 est passée, ou que la mission n'en est plus là. */
export async function runChangesPass(now: Date = new Date()): Promise<ChangesRun> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("mission_changes").select("id, mission_id, seq, status, created_at, missions(shoot_date, status, metier)").in("status", ["proposed", "quoted"]).limit(200);
    if (error) throw error;
    const rows = (data ?? []) as unknown as OpenRow[];
    const today = todayInBrussels(now);
    let expired = 0;
    for (const r of rows) {
      const gone = !r.missions || !changeableStatuses(r.missions.metier).includes(r.missions.status);
      if (!gone && !shouldExpire({ status: r.status, createdAt: r.created_at, shootDate: r.missions?.shoot_date ?? null }, today, now)) continue;
      const { data: moved, error: e2 } = await admin.from("mission_changes").update({ status: "expired", decided_at: now.toISOString() }).eq("id", r.id).in("status", ["proposed", "quoted"]).select("id");
      if (e2) throw e2;
      if (!moved || moved.length === 0) continue; // une réponse est arrivée entre-temps
      expired++;
      await logEvent(r.mission_id, { kind: "change_expired", actorKind: "system", reason: gone ? "mission_moved_on" : "no_answer_in_time", meta: { seq: r.seq } });
      if (r.missions?.status !== "annule") await Promise.all([mail(r.mission_id, "restaurant", "change_expired"), mail(r.mission_id, "provider", "change_expired")]);
    }
    return { ok: true, open: rows.length, expired };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-changes] passage impossible:", (e as Error).message);
    return { ok: false };
  }
}
