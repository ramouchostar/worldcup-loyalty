import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { computeStats, type Stats, type StatsMission } from "./mission-stats";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 undecies) — lire de quoi calculer les chiffres du module. Lecture seule, plateforme seule.
// Les 2 000 missions les plus récentes et leurs passages d'état : largement assez pour le pilote ; au-delà, la page le dit.
// ============================================================

const LIMIT = 2_000;
const METIERS = ["video", "photo", "design", "impression"] as const;
const STAGES = ["devis", "accepte", "date_bloquee", "production", "livre", "retouche", "valide", "verse", "litige"];

export async function loadStats(): Promise<{ ok: true; stats: Stats; truncated: boolean } | { ok: false }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("missions").select("id, metier, status, quote_cents, provider_cents, cancelled_by, created_at").neq("status", "brief").order("created_at", { ascending: false }).limit(LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; metier: string; status: string; quote_cents: number | null; provider_cents: number | null; cancelled_by: string | null; created_at: string }[];
    const missions: StatsMission[] = rows.map((r) => ({ id: r.id, metier: r.metier, status: r.status, quoteCents: r.quote_cents, providerCents: r.provider_cents, cancelledBy: r.cancelled_by, createdAt: r.created_at }));

    const reached = new Map<string, Set<string>>();
    if (missions.length > 0) {
      const { data: ev, error: e2 } = await admin.from("mission_events").select("mission_id, to_status").eq("kind", "status").in("to_status", STAGES).in("mission_id", missions.map((m) => m.id)).limit(20_000);
      if (e2) throw e2;
      for (const e of (ev ?? []) as { mission_id: string; to_status: string }[]) {
        if (!reached.has(e.mission_id)) reached.set(e.mission_id, new Set());
        reached.get(e.mission_id)!.add(e.to_status);
      }
    }
    return { ok: true, stats: computeStats(missions, reached, METIERS), truncated: missions.length >= LIMIT };
  } catch (e) {
    if (!isMissingTable(e as { code?: string; message?: string })) console.error("[missions-stats] loadStats failed:", (e as Error).message);
    return { ok: false };
  }
}
