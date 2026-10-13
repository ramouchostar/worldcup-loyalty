import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import type { ChangeStatus } from "./mission-changes";

// Réserver un prestataire (ADR 0084 §3 règle 9, PR M) — les demandes de modification d'une mission, en lecture seule :
// ce que lisent les pages et le module des pièces jointes. Fichier à part, léger : il ne tire ni e-mail ni cron.

type DbError = { code?: string; message?: string } | null;

export type ChangeRow = {
  id: string;
  seq: number;
  status: ChangeStatus;
  categories: string[];
  description: string;
  supplement_cents: number | null;
  delta_days: number | null;
  provider_note: string | null;
  decline_reason: string | null;
  paid_cents: number | null;
  provider_cents: number | null;
  created_at: string;
  quoted_at: string | null;
  decided_at: string | null;
};

export const CHANGE_COLUMNS = "id, seq, status, categories, description, supplement_cents, delta_days, provider_note, decline_reason, paid_cents, provider_cents, created_at, quoted_at, decided_at";

/** Les demandes d'une mission, de la plus ancienne à la plus récente. Migration absente → « unavailable » (rien n'est affiché). */
export async function listChanges(missionId: string): Promise<{ ok: true; changes: ChangeRow[] } | { ok: false; reason: "unavailable" }> {
  try {
    const { data, error } = await createAdminClient().from("mission_changes").select(CHANGE_COLUMNS).eq("mission_id", missionId).order("seq", { ascending: true });
    if (error) throw error;
    return { ok: true, changes: (data ?? []) as ChangeRow[] };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-changes-state] listChanges failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}
