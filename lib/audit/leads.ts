// ADR 0071 — les demandes d'audit gratuit (table audit_leads). SERVEUR
// UNIQUEMENT (service role) : la table est en RLS sans policy.
//
// FAIL-CLOSED côté public : sans la table, on ne peut ni plafonner ni garder
// la demande, donc la page publique n'appelle aucune source payante et le dit.

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase";
import { isMissingTable } from "./store";
import type { QuickScan } from "./quick-scan-types";

export type ScanStatus = "en_cours" | "ok" | "echec" | "hors_zone";

export interface LeadRow {
  id: string;
  place_id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  in_brussels: boolean | null;
  scan_status: ScanStatus;
  scan: QuickScan;
  score: number | null;
  scan_error: string | null;
  phone: string | null;
  consent_at: string | null;
  audit_id: string | null;
  whatsapp_sent_at: string | null;
  whatsapp_error: string | null;
  ip_hash: string | null;
  cost_usd: number;
  calls: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export class LeadsUnavailable extends Error {
  constructor() {
    super("table audit_leads absente");
    this.name = "LeadsUnavailable";
  }
}

// Plafonds (ADR 0071 §3).
export const PER_IP_PER_DAY = 3;
export function dailyMax(): number {
  const n = Number(process.env.AUDIT_PUBLIC_DAILY_MAX);
  return Number.isFinite(n) && n > 0 ? n : 150;
}

/** Empreinte salée de l'adresse IP : jamais l'adresse en clair. */
export function ipHash(ip: string): string {
  const salt = process.env.AUDIT_IP_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "boosteats-audit";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** UUID stable dérivé d'une empreinte, pour le limiteur générique (check_rate_limit, m44). */
export function uuidFromHash(hex: string): string {
  const h = hex.padEnd(32, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Première adresse de x-forwarded-for (Vercel), sinon x-real-ip. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "inconnue";
}

const since24h = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

export async function quota(ip: string): Promise<{ ok: true } | { ok: false; reason: "ip" | "jour" }> {
  const admin = createAdminClient();
  const [mine, all] = await Promise.all([
    admin.from("audit_leads").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash(ip)).gte("created_at", since24h()),
    admin.from("audit_leads").select("id", { count: "exact", head: true }).gte("created_at", since24h()),
  ]);
  if (isMissingTable(mine.error) || isMissingTable(all.error)) throw new LeadsUnavailable();
  if (mine.error) throw mine.error;
  if (all.error) throw all.error;
  if ((mine.count ?? 0) >= PER_IP_PER_DAY) return { ok: false, reason: "ip" };
  if ((all.count ?? 0) >= dailyMax()) return { ok: false, reason: "jour" };
  return { ok: true };
}

/** Score de moins de 24 h déjà calculé pour cette fiche (réutilisé sans nouvel appel payant). */
export async function recentScan(placeId: string): Promise<LeadRow | null> {
  const { data, error } = await createAdminClient()
    .from("audit_leads")
    .select("*")
    .eq("place_id", placeId)
    .in("scan_status", ["ok", "hors_zone"])
    .gte("created_at", since24h())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isMissingTable(error)) throw new LeadsUnavailable();
  if (error) throw error;
  return (data as LeadRow | null) ?? null;
}

export async function createLead(input: Partial<LeadRow> & { place_id: string; name: string }): Promise<LeadRow> {
  const { data, error } = await createAdminClient().from("audit_leads").insert(input).select("*").single();
  if (isMissingTable(error)) throw new LeadsUnavailable();
  if (error) throw error;
  return data as LeadRow;
}

export async function getLead(id: string): Promise<LeadRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await createAdminClient().from("audit_leads").select("*").eq("id", id).maybeSingle();
  if (isMissingTable(error)) throw new LeadsUnavailable();
  if (error) throw error;
  return (data as LeadRow | null) ?? null;
}

export async function updateLead(id: string, patch: Partial<Omit<LeadRow, "id" | "created_at">>): Promise<void> {
  const { error } = await createAdminClient()
    .from("audit_leads")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listLeads(limit = 100): Promise<{ missing: true } | { missing: false; rows: LeadRow[] }> {
  const { data, error } = await createAdminClient()
    .from("audit_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (isMissingTable(error)) return { missing: true };
  if (error) throw error;
  return { missing: false, rows: (data ?? []) as LeadRow[] };
}
