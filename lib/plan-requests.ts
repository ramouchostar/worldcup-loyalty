import { createAdminClient } from "./supabase";
import type { Feature, Plan } from "./entitlements";

// ADR 0029 Phase 2 — demandes de plan (paywall doux sans Stripe, m51).
// Le restaurateur clique « Demander le plan Croissance/Pro » ; le super-admin
// voit la demande sur /platform et active le plan à la main (flip m48).

export type PlanRequest = {
  id: string;
  restaurant_id: string;
  requested_plan: Exclude<Plan, "gratuit">;
  feature: string | null;
  requested_by: string | null;
  status: "pending" | "handled";
  created_at: string;
};

export type RequestPlanResult = "created" | "already_pending" | "error";

// Enregistre la demande. Idempotent grâce à l'index unique partiel m51 :
// une demande pending existe déjà → « déjà envoyée » (pas un échec).
export async function requestPlan(
  restaurantId: string,
  plan: Exclude<Plan, "gratuit">,
  feature: Feature | null,
  requestedBy: string
): Promise<RequestPlanResult> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("plan_requests").insert({
      restaurant_id: restaurantId,
      requested_plan: plan,
      feature,
      requested_by: requestedBy,
    });
    if (!error) return "created";
    if (error.code === "23505") return "already_pending"; // unique partiel m51
    throw error;
  } catch (e) {
    console.error("[plan-requests] requestPlan failed:", (e as Error).message);
    return "error";
  }
}

// Demandes en attente pour /platform (avec nom du resto résolu côté appelant).
export async function getPendingPlanRequests(): Promise<PlanRequest[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("plan_requests")
      .select("id, restaurant_id, requested_plan, feature, requested_by, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as PlanRequest[]) ?? [];
  } catch (e) {
    // m51 pas encore appliquée → section vide, jamais de crash /platform.
    console.error("[plan-requests] getPendingPlanRequests failed:", (e as Error).message);
    return [];
  }
}

export async function markPlanRequestHandled(requestId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("plan_requests")
    .update({ status: "handled", handled_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
}

// Solde les demandes en attente couvertes par un plan devenu actif — appelé
// après setPlan() : activer Croissance solde la demande Croissance ; activer
// Pro solde Croissance ET Pro. Best-effort (le flip a déjà réussi).
export async function settlePlanRequests(restaurantId: string, plan: Plan): Promise<void> {
  if (plan === "gratuit") return;
  try {
    const admin = createAdminClient();
    const covered = plan === "pro" ? ["croissance", "pro"] : ["croissance"];
    await admin
      .from("plan_requests")
      .update({ status: "handled", handled_at: new Date().toISOString() })
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending")
      .in("requested_plan", covered);
  } catch (e) {
    console.error("[plan-requests] settlePlanRequests failed:", (e as Error).message);
  }
}
