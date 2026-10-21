import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { profileFromRow, sanitizeProfile, validateProfile, type ProfileIssue, type ProviderProfile } from "./provider-profile";

// ============================================================
// Réserver un prestataire (ADR 0084 §2 bis) — lire et enregistrer le profil.
//
// FAIL-OPEN : migration 20261021-1100 absente → « indisponible », jamais un crash. Le profil est écrit par son propriétaire seul
// (route du prestataire) ; les restaurateurs le LISENT, et seulement pour le prestataire d'une de leurs missions.
// ============================================================

type DbError = { code?: string; message?: string };
const COLUMN_MISSING = "42703";
const missing = (e: unknown) => isMissingTable(e as DbError) || (e as DbError)?.code === COLUMN_MISSING || /profile/.test((e as DbError)?.message ?? "");

export type LoadedProfile = { ok: true; profile: ProviderProfile; updatedAt: string | null } | { ok: false };

export async function loadProfile(providerId: string): Promise<LoadedProfile> {
  try {
    const { data, error } = await createAdminClient().from("providers").select("profile, profile_updated_at").eq("id", providerId).maybeSingle();
    if (error) throw error;
    const row = data as { profile: unknown; profile_updated_at: string | null } | null;
    if (!row) return { ok: false };
    return { ok: true, profile: profileFromRow(row.profile), updatedAt: row.profile_updated_at };
  } catch (e) {
    if (!missing(e)) console.error("[providers-profile] loadProfile failed:", (e as Error).message);
    return { ok: false };
  }
}

export type SaveResult = { ok: true; profile: ProviderProfile } | { ok: false; reason: "invalid"; issues: ProfileIssue[] } | { ok: false; reason: "unavailable" };

/** Enregistre le profil de CE prestataire. Un profil refusé n'est jamais écrit à moitié : tout ou rien. */
export async function saveProfile(providerId: string, raw: unknown): Promise<SaveResult> {
  const profile = sanitizeProfile(raw);
  const verdict = validateProfile(profile);
  if (!verdict.ok) return { ok: false, reason: "invalid", issues: verdict.issues };
  try {
    const now = new Date().toISOString();
    const { data, error } = await createAdminClient().from("providers").update({ profile, profile_updated_at: now }).eq("id", providerId).select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, reason: "unavailable" };
    return { ok: true, profile };
  } catch (e) {
    if (!missing(e)) console.error("[providers-profile] saveProfile failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}
