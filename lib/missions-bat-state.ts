import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import type { CorrectionNote, ProofStatus } from "./mission-print";

// Réserver un prestataire (ADR 0084, PR P) — les épreuves (bon à tirer) d'une mission, en lecture seule : ce que lisent les
// pages, l'annulation et les livraisons. Fichier à part, léger : il ne tire ni e-mail ni cron.

type DbError = { code?: string; message?: string } | null;

export type ProofRow = {
  id: string;
  round: number;
  status: ProofStatus;
  links: string[];
  message: string | null;
  corrections: CorrectionNote[] | null;
  signed_name: string | null;
  checks: Record<string, boolean> | null;
  created_at: string;
  decided_at: string | null;
  signed_at: string | null;
};

export const PROOF_COLUMNS = "id, round, status, links, message, corrections, signed_name, checks, created_at, decided_at, signed_at";

/** Les épreuves d'une mission, de la plus ancienne à la plus récente. Migration absente → « unavailable » (rien n'est affiché). */
export async function listProofs(missionId: string): Promise<{ ok: true; proofs: ProofRow[] } | { ok: false; reason: "unavailable" }> {
  try {
    const { data, error } = await createAdminClient().from("mission_proofs").select(PROOF_COLUMNS).eq("mission_id", missionId).order("round", { ascending: true });
    if (error) throw error;
    return { ok: true, proofs: (data ?? []) as ProofRow[] };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-bat-state] listProofs failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}

/** Le bon à tirer est-il signé ? Seule une impression en a un ; migration absente ou autre métier → faux. Ferme l'annulation. */
export async function batSignedFor(m: { id: string; metier: string; status: string }): Promise<boolean> {
  if (m.metier !== "impression" || m.status !== "production") return false;
  const list = await listProofs(m.id);
  return list.ok && list.proofs.some((p) => p.status === "signed");
}
