"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess, isEstablishmentAdmin } from "@/lib/admin-guard";
import { cancelRequest, createRequest, estimateFor, pubAvailability, requestCreativeUpload, requestRecharge, resubmit, setPaused } from "@/lib/ads/requests";

// ADR 0086 §1 — les gestes du restaurateur sur SA pub. Chaque action se re-garde
// (une Server Action est une route publique) : membre de la console de CET établissement,
// et Pub ouverte pour lui.

export type ActionResult = { ok: boolean; error?: string; requestId?: string };

async function guard(restaurantId: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Connecte-toi pour continuer." };
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) return { error: "Accès refusé." };
  const access = await getAdminAccess(user.id, restaurantId);
  const av = await pubAvailability(restaurantId, access.isSuperAdmin);
  if (!av.open) return { error: "La Pub n'est pas encore ouverte pour ton établissement." };
  return { userId: user.id };
}

const done = (restaurantId: string) => revalidatePath(`/admin/${restaurantId}/pub`, "layout");

export async function askUpload(restaurantId: string, type: string, size: number): Promise<{ ok: true; path: string; uploadUrl: string } | { ok: false; error: string }> {
  const g = await guard(restaurantId);
  if ("error" in g) return { ok: false, error: g.error };
  return requestCreativeUpload(restaurantId, type, size);
}

export async function submitRequest(restaurantId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  const g = await guard(restaurantId);
  if ("error" in g) return { ok: false, error: g.error };
  const r = await createRequest(restaurantId, g.userId, raw);
  if (r.ok) done(restaurantId);
  return r.ok ? { ok: true, requestId: r.requestId } : { ok: false, error: r.error };
}

export async function cancel(restaurantId: string, requestId: string): Promise<ActionResult> {
  const g = await guard(restaurantId);
  if ("error" in g) return { ok: false, error: g.error };
  const r = await cancelRequest(restaurantId, requestId);
  done(restaurantId);
  return r;
}

export async function pause(restaurantId: string, requestId: string, paused: boolean): Promise<ActionResult> {
  const g = await guard(restaurantId);
  if ("error" in g) return { ok: false, error: g.error };
  const r = await setPaused(restaurantId, requestId, paused, g.userId);
  done(restaurantId);
  return r;
}

export async function recharge(restaurantId: string, requestId: string, budgetEuros: number): Promise<ActionResult> {
  const g = await guard(restaurantId);
  if ("error" in g) return { ok: false, error: g.error };
  const r = await requestRecharge(restaurantId, requestId, budgetEuros);
  done(restaurantId);
  return r;
}

export async function correct(restaurantId: string, requestId: string, raw: { adText?: unknown; creative?: unknown }): Promise<ActionResult> {
  const g = await guard(restaurantId);
  if ("error" in g) return { ok: false, error: g.error };
  const r = await resubmit(restaurantId, requestId, raw, g.userId);
  done(restaurantId);
  return r;
}

/** Ce que la pub peut donner, recalculé quand l'objectif, la zone ou le budget changent. */
export async function estimate(restaurantId: string, objective: string, radiusKm: number, budgetEuros: number): Promise<{ ok: true; estimate: import("@/lib/ads/estimate").Estimate } | { ok: false }> {
  const g = await guard(restaurantId);
  if ("error" in g) return { ok: false };
  if (!Number.isFinite(budgetEuros) || budgetEuros < 1 || budgetEuros > 100_000 || ![1, 3, 5, 10].includes(radiusKm)) return { ok: false };
  return estimateFor(restaurantId, objective, radiusKm, Math.round(budgetEuros) * 100);
}
