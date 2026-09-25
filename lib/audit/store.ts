// ADR 0069 §4 — tous les audits sont gardés en base. SERVEUR UNIQUEMENT
// (service role) : les tables sont en RLS sans policy.
//
// Fail-open : tant que la migration 20260923-2039 n'est pas appliquée, les
// lectures renvoient `missing: true` et la console le dit, au lieu de planter.

import { createAdminClient } from "@/lib/supabase";

export type AuditStatus = "en_cours" | "mesure" | "revise" | "final" | "echec";
export type SectionKey = "fiche" | "avis" | "concurrents" | "reseaux" | "seo";
export type SectionStatus = "en_cours" | "ok" | "echec" | "non_branche";

export interface AuditRow {
  id: string;
  place_id: string | null;
  cid: string | null;
  name: string;
  address: string | null;
  postal_code: string | null;
  status: AuditStatus;
  scores: Record<string, number | null>;
  signals: unknown;
  answers: unknown;
  recommendations: unknown;
  cost_usd: number;
  calls: Record<string, number>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SectionRow {
  id: string;
  audit_id: string;
  section: SectionKey;
  status: SectionStatus;
  source: string | null;
  raw: unknown;
  result: unknown;
  error: string | null;
  cost_usd: number;
  started_at: string;
  finished_at: string | null;
}

export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

export async function createAudit(input: {
  name: string;
  placeId?: string | null;
  cid?: string | null;
  address?: string | null;
  postalCode?: string | null;
  createdBy?: string | null;
}): Promise<AuditRow> {
  const { data, error } = await createAdminClient()
    .from("restaurant_audits")
    .insert({
      name: input.name,
      place_id: input.placeId ?? null,
      cid: input.cid ?? null,
      address: input.address ?? null,
      postal_code: input.postalCode ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AuditRow;
}

export async function updateAudit(id: string, patch: Partial<Omit<AuditRow, "id" | "created_at">>): Promise<void> {
  const { error } = await createAdminClient()
    .from("restaurant_audits")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Enregistre un volet (un par audit et par volet : on écrase la tentative précédente). */
export async function saveSection(
  auditId: string,
  section: SectionKey,
  patch: { status: SectionStatus; source?: string | null; raw?: unknown; result?: unknown; error?: string | null; cost_usd?: number },
): Promise<void> {
  const done = patch.status !== "en_cours";
  const { error } = await createAdminClient()
    .from("restaurant_audit_sections")
    .upsert(
      {
        audit_id: auditId,
        section,
        status: patch.status,
        source: patch.source ?? null,
        raw: patch.raw ?? null,
        result: patch.result ?? null,
        error: patch.error ?? null,
        cost_usd: patch.cost_usd ?? 0,
        finished_at: done ? new Date().toISOString() : null,
      },
      { onConflict: "audit_id,section" },
    );
  if (error) throw error;
}

export type Listing<T> = { missing: true } | { missing: false; rows: T[] };

export async function listAudits(limit = 100): Promise<Listing<AuditRow>> {
  const { data, error } = await createAdminClient()
    .from("restaurant_audits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (isMissingTable(error)) return { missing: true };
  if (error) throw error;
  return { missing: false, rows: (data ?? []) as AuditRow[] };
}

export async function getAudit(id: string): Promise<{ audit: AuditRow; sections: SectionRow[] } | null> {
  const admin = createAdminClient();
  const [{ data: audit, error }, { data: sections }] = await Promise.all([
    admin.from("restaurant_audits").select("*").eq("id", id).maybeSingle(),
    admin.from("restaurant_audit_sections").select("*").eq("audit_id", id),
  ]);
  if (isMissingTable(error)) return null;
  if (error) throw error;
  if (!audit) return null;
  return { audit: audit as AuditRow, sections: (sections ?? []) as SectionRow[] };
}
