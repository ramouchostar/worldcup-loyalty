import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import type { RevenueMission } from "./provider-revenue";

// ============================================================
// Réserver un prestataire (ADR 0084 §2) — lire les missions qui comptent pour les revenus d'un prestataire.
//
// Lecture seule, séparée de `listForProvider` : `paid_out_at` (migration 20261013-1100) ne doit jamais faire tomber la boîte du
// prestataire si elle manque. Sans cette colonne, la page n'affiche pas « versé » à tort : elle répond « indisponible ».
// ============================================================

type Row = {
  id: string;
  metier: string;
  status: string;
  quote_cents: number | null;
  provider_cents: number | null;
  paid_out_at: string | null;
  cancellation: { providerPayoutCents?: number } | null;
  cancellation_settled_at: string | null;
  updated_at: string;
  restaurants: { name: string } | null;
};

export async function loadRevenueMissions(providerId: string): Promise<{ ok: true; missions: RevenueMission[] } | { ok: false }> {
  try {
    const { data, error } = await createAdminClient()
      .from("missions")
      .select("id, metier, status, quote_cents, provider_cents, paid_out_at, cancellation, cancellation_settled_at, updated_at, restaurants(name)")
      .eq("provider_id", providerId)
      .neq("status", "brief")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return {
      ok: true,
      missions: ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        restaurantName: r.restaurants?.name ?? "Restaurant",
        metier: r.metier,
        status: r.status,
        quoteCents: r.quote_cents,
        providerCents: r.provider_cents,
        paidOutAt: r.paid_out_at,
        cancellation: r.cancellation,
        cancellationSettledAt: r.cancellation_settled_at,
        updatedAt: r.updated_at,
      })),
    };
  } catch (e) {
    if (!isMissingTable(e as { code?: string; message?: string }) && (e as { code?: string })?.code !== "42703") console.error("[provider-revenue-data] load failed:", (e as Error).message);
    return { ok: false };
  }
}
