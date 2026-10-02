// ADR 0076 — CRM de prospection : lecture et écriture. SERVEUR UNIQUEMENT
// (service role) : les tables sont en RLS sans policy.
//
// Fail-open : tant que la migration 20261003-0020 n'est pas appliquée, les
// lectures renvoient `missing: true` et la console le dit, au lieu de planter.

import { createAdminClient } from "@/lib/supabase";
import { isMissingTable } from "@/lib/audit/store";
import type { CrmEventKind, CrmOffer, CrmStatus, CrmStrategy, ProspectInput, StatusEvent } from "@/lib/crm-model";

export interface ProspectRow extends ProspectInput {
  id: string;
  place_id: string | null;
  maps_uri: string | null;
  status: CrmStatus;
  lost_reason: string | null;
  do_not_contact: boolean;
  next_action_at: string | null;
  owner_user: string | null;
  notes: string | null;
  audit_id: string | null;
  restaurant_id: string | null;
  source: "import" | "google_places" | "manuel";
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow extends StatusEvent {
  id: string;
  kind: CrmEventKind;
  from_status: string | null;
  note: string | null;
  created_by: string | null;
}

export type Listing<T> = { missing: true } | { missing: false; rows: T[] };

export async function listProspects(): Promise<Listing<ProspectRow>> {
  const { data, error } = await createAdminClient()
    .from("crm_prospects")
    .select("*")
    .order("next_action_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(2000);
  if (isMissingTable(error)) return { missing: true };
  if (error) throw error;
  return { missing: false, rows: (data ?? []) as ProspectRow[] };
}

export async function listEvents(): Promise<Listing<EventRow>> {
  const { data, error } = await createAdminClient()
    .from("crm_prospect_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (isMissingTable(error)) return { missing: true };
  if (error) throw error;
  return { missing: false, rows: (data ?? []) as EventRow[] };
}

export async function getProspect(id: string): Promise<ProspectRow | null> {
  const { data, error } = await createAdminClient().from("crm_prospects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ProspectRow | null) ?? null;
}

/**
 * Import : une ligne déjà présente (même nom + code postal, ou même fiche
 * Google) n'est ni dédoublée ni écrasée — on ne perd jamais un statut ou une
 * note saisis à la main. Renvoie le nombre de lignes créées et ignorées.
 */
export async function importProspects(
  rows: (ProspectInput & { place_id?: string | null; maps_uri?: string | null; status?: CrmStatus })[],
  source: ProspectRow["source"],
): Promise<{ created: number; skipped: number }> {
  if (rows.length === 0) return { created: 0, skipped: 0 };
  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("crm_prospects").select("name, postal_code, place_id");
  if (error) throw error;
  const keyOf = (name: string, cp: string | null) => `${name.trim().toLowerCase()}|${cp ?? ""}`;
  const seen = new Set((existing ?? []).map((e) => keyOf(e.name as string, e.postal_code as string | null)));
  const places = new Set((existing ?? []).map((e) => e.place_id as string | null).filter(Boolean));

  const fresh = rows.filter((r) => {
    const k = keyOf(r.name, r.postal_code);
    if (seen.has(k) || (r.place_id && places.has(r.place_id))) return false;
    seen.add(k);
    if (r.place_id) places.add(r.place_id);
    return true;
  });
  if (fresh.length) {
    const { error: insErr } = await admin.from("crm_prospects").insert(fresh.map((r) => ({ ...r, source })));
    if (insErr) throw insErr;
  }
  return { created: fresh.length, skipped: rows.length - fresh.length };
}

export interface ProspectPatch {
  status?: CrmStatus;
  strategy?: CrmStrategy;
  offer?: CrmOffer;
  pitch?: string | null;
  notes?: string | null;
  next_action_at?: string | null;
  owner_user?: string | null;
  lost_reason?: string | null;
  do_not_contact?: boolean;
  phone?: string | null;
  email?: string | null;
  owner_name?: string | null;
  owner_contact?: string | null;
  audit_id?: string | null;
  restaurant_id?: string | null;
  place_id?: string | null;
  maps_uri?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  website?: string | null;
  address?: string | null;
  signed_at?: string | null;
}

export async function updateProspect(id: string, patch: ProspectPatch): Promise<void> {
  const { error } = await createAdminClient()
    .from("crm_prospects")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function addEvent(input: {
  prospectId: string;
  kind: CrmEventKind;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  createdBy: string | null;
}): Promise<void> {
  const { error } = await createAdminClient().from("crm_prospect_events").insert({
    prospect_id: input.prospectId,
    kind: input.kind,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    note: input.note ?? null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}
