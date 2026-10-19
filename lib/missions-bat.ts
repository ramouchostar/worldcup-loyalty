import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { getMission, logEvent } from "./missions";
import { getForProvider } from "./provider-missions";
import type { ProviderRow } from "./providers";
import { mailMission as mail } from "./missions-notify";
import { sanitizeDelivery, type DeliveryIssue } from "./mission-dayof";
import { PROOF_COLUMNS, listProofs, type ProofRow } from "./missions-bat-state";
import {
  batChecklist,
  canRequestCorrections,
  judgeCorrections,
  judgeReview,
  judgeSubmitProof,
  sanitizeCorrections,
  sanitizeSign,
  validateProof,
  validateSign,
  type CorrectionIssue,
  type SignIssue,
} from "./mission-print";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 bis, PR P) — le bon à tirer : l'imprimeur envoie une épreuve, le restaurateur la
// signe ou demande des corrections. Les règles vivent dans lib/mission-print.ts (pures, testées) ; ce fichier les applique.
// Chaque passage est un compare-and-swap sur l'état de l'épreuve (deux clics ne signent ni ne corrigent deux fois), laisse
// sa ligne dans `mission_events`, et chaque e-mail a son issue tracée. FAIL-OPEN : migration 20261019-1000 absente →
// « unavailable », rien n'est écrit à moitié.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

// ── L'imprimeur envoie une épreuve ───────────────────────────

export type SubmitProofResult =
  | { ok: true; round: number }
  | { ok: false; reason: "not_found" | "not_print" | "not_production" | "already_signed" | "awaiting_review" | "no_rounds_left" | "unavailable" }
  | { ok: false; reason: "invalid"; issues: DeliveryIssue[] };

export async function submitProof(missionId: string, provider: ProviderRow, raw: unknown): Promise<SubmitProofResult> {
  const found = await getForProvider(missionId, provider.id);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (m.metier !== "impression") return { ok: false, reason: "not_print" };
  const list = await listProofs(missionId);
  if (!list.ok) return unavailable;

  const verdict = judgeSubmitProof(m.status, list.proofs);
  if (verdict !== "ok") return { ok: false, reason: verdict };

  const input = sanitizeDelivery(raw);
  const check = validateProof(input);
  if (!check.ok) {
    await logEvent(missionId, { kind: "bat_refused", actorKind: "provider", actorId: provider.user_id ?? undefined, reason: "invalid", meta: { issues: check.issues.map((i) => `${i.code}${i.index === undefined ? "" : `@${i.index}`}`) } });
    return { ok: false, reason: "invalid", issues: check.issues };
  }

  try {
    const round = list.proofs.length + 1;
    const { error } = await createAdminClient().from("mission_proofs").insert({ mission_id: missionId, round, links: input.links, message: input.message || null });
    if (error) {
      // Les index uniques : une épreuve est déjà en attente, ou celle-ci vient d'être déposée (deux clics).
      if (error.code === "23505") return { ok: false, reason: "awaiting_review" };
      throw error;
    }
    await logEvent(missionId, { kind: "bat_submitted", actorKind: "provider", actorId: provider.user_id ?? undefined, meta: { round, links: input.links.length } });
    await mail(missionId, "restaurant", "bat_submitted", { count: round });
    return { ok: true, round };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-bat] submitProof failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Le restaurateur demande des corrections ──────────────────

export type CorrectionsResult =
  | { ok: true; left: number }
  | { ok: false; reason: "not_found" | "not_print" | "not_production" | "not_awaiting_review" | "no_rounds_left" | "unavailable" }
  | { ok: false; reason: "invalid"; empty: boolean; problems: CorrectionIssue[] };

export async function requestCorrections(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<CorrectionsResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (m.metier !== "impression") return { ok: false, reason: "not_print" };
  const list = await listProofs(missionId);
  if (!list.ok) return unavailable;
  const review = judgeReview(m.status, list.proofs);
  if (review !== "ok") return { ok: false, reason: review };
  if (!canRequestCorrections(list.proofs)) return { ok: false, reason: "no_rounds_left" };

  const verdict = judgeCorrections(sanitizeCorrections(raw));
  if (!verdict.ok) {
    await logEvent(missionId, { kind: "bat_corrections_refused", actorKind: "restaurant", actorId: userId, reason: verdict.reason, meta: { problems: verdict.problems.map((p) => `${p.index}:${p.issue}`) } });
    return { ok: false, reason: "invalid", empty: verdict.reason === "empty", problems: verdict.problems };
  }

  try {
    const pending = list.proofs.at(-1)!;
    const { data, error } = await createAdminClient()
      .from("mission_proofs")
      .update({ status: "corrections", corrections: verdict.notes, decided_at: new Date().toISOString() })
      .eq("id", pending.id)
      .eq("status", "proposed") // deux clics : un seul tour
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "not_awaiting_review" };
    await logEvent(missionId, { kind: "bat_corrections", actorKind: "restaurant", actorId: userId, meta: { round: pending.round, notes: verdict.notes.length } });
    await mail(missionId, "provider", "bat_corrections", { count: verdict.notes.length });
    return { ok: true, left: Math.max(0, 3 - list.proofs.length) };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-bat] requestCorrections failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Le restaurateur signe ────────────────────────────────────

export type SignResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_print" | "not_production" | "not_awaiting_review" | "unavailable" }
  | { ok: false; reason: "invalid"; issues: SignIssue[] };

/** La signature : tous les points cochés (ceux de CETTE épreuve), un nom. Elle ferme l'annulation et lance l'impression. */
export async function signBat(missionId: string, restaurantId: string, userId: string, raw: unknown): Promise<SignResult> {
  const found = await getMission(missionId, restaurantId);
  if (!found.ok) return unavailable;
  const m = found.mission;
  if (!m) return { ok: false, reason: "not_found" };
  if (m.metier !== "impression") return { ok: false, reason: "not_print" };
  const list = await listProofs(missionId);
  if (!list.ok) return unavailable;
  const review = judgeReview(m.status, list.proofs);
  if (review !== "ok") return { ok: false, reason: review };

  const input = sanitizeSign(raw);
  const check = validateSign(input, batChecklist(m.brief));
  if (!check.ok) {
    await logEvent(missionId, { kind: "bat_sign_refused", actorKind: "restaurant", actorId: userId, reason: "invalid", meta: { issues: check.issues.map((i) => `${i.code}${i.key ? `:${i.key}` : ""}`) } });
    return { ok: false, reason: "invalid", issues: check.issues };
  }

  try {
    const pending = list.proofs.at(-1)!;
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("mission_proofs")
      .update({ status: "signed", signed_name: input.name, signed_by: userId, signed_at: now, decided_at: now, checks: input.checks })
      .eq("id", pending.id)
      .eq("status", "proposed") // deux clics : une seule signature
      .select("id");
    if (error) {
      if (error.code === "23505") return { ok: false, reason: "not_awaiting_review" };
      throw error;
    }
    if (!data || data.length === 0) return { ok: false, reason: "not_awaiting_review" };
    await logEvent(missionId, { kind: "bat_signed", actorKind: "restaurant", actorId: userId, meta: { round: pending.round, signedName: input.name, checks: input.checks, how: "solde dû à la signature, réglé à la main (pilote)" } });
    await mail(missionId, "provider", "bat_signed");
    await mail(missionId, "platform", "bat_signed");
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-bat] signBat failed:", (e as Error).message);
    return unavailable;
  }
}

export type { ProofRow };
export { PROOF_COLUMNS };
