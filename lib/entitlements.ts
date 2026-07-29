import { createAdminClient } from "./supabase";

// ADR 0029 — droits d'accès par établissement (plan + essais par fonction).
// Le client payant est le RESTAURATEUR ; le membre ne paie jamais et n'est
// jamais concerné par ces droits (ADR 0007/0028 intacts). Lecture/écriture
// service-role only (tables m48 sans policy).
//
// FAIL-OPEN au rollout : côté DÉCISION D'ACCÈS (getEntitlement), toute erreur
// — m48 non appliquée, panne DB — renvoie un accès DÉBLOQUÉ. Un bug de droits
// ne doit jamais verrouiller un restaurateur ni casser une surface admin.
// Même philosophie que lib/budget.ts et lib/rate-limit.ts.

export type Plan = "gratuit" | "croissance" | "pro";

export type Feature =
  | "forecast"
  | "sales"
  | "insights"
  | "broadcast_scheduled"
  | "barometer_advanced"
  | "sector_benchmarks";

// Plan qui débloque chaque fonction : A (analytique établissement) → croissance,
// B (repères secteur) → pro. Source de vérité unique du mapping fonction→plan.
export const FEATURE_PLAN: Record<Feature, Plan> = {
  forecast: "croissance",
  sales: "croissance",
  insights: "croissance",
  broadcast_scheduled: "croissance",
  barometer_advanced: "croissance",
  sector_benchmarks: "pro",
};

// Durée d'essai par défaut au déblocage (ADR 0029 §5, ajustable par fonction).
export const DEFAULT_TRIAL_DAYS = 30;

const PLAN_RANK: Record<Plan, number> = { gratuit: 0, croissance: 1, pro: 2 };
const DAY_MS = 86_400_000;

export type EntitlementState = "debloque" | "essai" | "verrouille";

export type Entitlement = {
  plan: Plan; // plan courant du resto
  requiredPlan: Plan; // plan qui débloque la fonction
  state: EntitlementState;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  allowed: boolean; // raccourci : state !== 'verrouille'
};

// Plan courant d'un établissement — pour l'AFFICHAGE (badge de plan, layout).
// Défaut 'gratuit' si aucune ligne OU si l'abonnement n'est pas actif OU en cas
// d'erreur : on n'affiche jamais un plan payant qu'on n'a pas pu confirmer.
export async function getPlan(restaurantId: string): Promise<Plan> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("restaurant_subscriptions")
      .select("plan, status")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "active") return "gratuit";
    return (data.plan as Plan) ?? "gratuit";
  } catch (e) {
    console.error("[entitlements] getPlan failed:", (e as Error).message);
    return "gratuit";
  }
}

// Décision d'accès pour une fonction donnée. Résolution :
//   1. le plan couvre la fonction        → 'debloque' (accès payant)
//   2. sinon, essai encore actif          → 'essai'
//   3. ni plan ni essai actif             → 'verrouille' (paywall doux)
// Fail-open : toute erreur → 'debloque' (jamais verrouiller sur incident).
export async function getEntitlement(restaurantId: string, feature: Feature): Promise<Entitlement> {
  const requiredPlan = FEATURE_PLAN[feature];
  try {
    const admin = createAdminClient();
    const [subRes, trialRes] = await Promise.all([
      admin
        .from("restaurant_subscriptions")
        .select("plan, status")
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
      admin
        .from("feature_trials")
        .select("trial_ends_at")
        .eq("restaurant_id", restaurantId)
        .eq("feature", feature)
        .maybeSingle(),
    ]);
    if (subRes.error) throw subRes.error;
    if (trialRes.error) throw trialRes.error;

    const sub = subRes.data as { plan: Plan; status: string } | null;
    const plan: Plan = sub && sub.status === "active" ? (sub.plan ?? "gratuit") : "gratuit";

    // 1. Le plan couvre la fonction.
    if (PLAN_RANK[plan] >= PLAN_RANK[requiredPlan]) {
      return { plan, requiredPlan, state: "debloque", trialEndsAt: null, trialDaysLeft: null, allowed: true };
    }

    // 2. Essai en cours ?
    const trialEndsAt = (trialRes.data as { trial_ends_at: string } | null)?.trial_ends_at ?? null;
    if (trialEndsAt) {
      const msLeft = new Date(trialEndsAt).getTime() - Date.now();
      if (msLeft > 0) {
        return {
          plan,
          requiredPlan,
          state: "essai",
          trialEndsAt,
          trialDaysLeft: Math.ceil(msLeft / DAY_MS),
          allowed: true,
        };
      }
    }

    // 3. Ni plan, ni essai actif → paywall doux.
    return { plan, requiredPlan, state: "verrouille", trialEndsAt, trialDaysLeft: 0, allowed: false };
  } catch (e) {
    console.error("[entitlements] getEntitlement failed:", (e as Error).message);
    return { plan: "gratuit", requiredPlan, state: "debloque", trialEndsAt: null, trialDaysLeft: null, allowed: true };
  }
}

// Démarre l'essai d'une fonction si pas déjà fait (idempotent — ON CONFLICT DO
// NOTHING). Appelé quand la fonction devient data-ready / à la 1re utilisation
// (Phase 2). Best-effort : un échec est loggé, jamais propagé (ne casse pas la
// page qui affiche la fonction). No-op utile si le resto a déjà le plan requis.
export async function ensureTrialStarted(
  restaurantId: string,
  feature: Feature,
  trialDays: number = DEFAULT_TRIAL_DAYS
): Promise<void> {
  try {
    const admin = createAdminClient();
    const trialEndsAt = new Date(Date.now() + trialDays * DAY_MS).toISOString();
    await admin.from("feature_trials").upsert(
      { restaurant_id: restaurantId, feature, trial_ends_at: trialEndsAt },
      { onConflict: "restaurant_id,feature", ignoreDuplicates: true }
    );
  } catch (e) {
    console.error("[entitlements] ensureTrialStarted failed:", (e as Error).message);
  }
}

// Bascule le plan d'un établissement — flip manuel super-admin en attendant
// Stripe (Phase 5). plan_activated_at posé au 1er passage payant. Contrairement
// aux lectures, cette écriture PROPAGE l'erreur : c'est une action explicite,
// l'appelant (route super-admin) doit pouvoir rapporter un échec.
export async function setPlan(restaurantId: string, plan: Plan): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    restaurant_id: restaurantId,
    plan,
    status: "active",
    updated_at: now,
  };
  if (plan !== "gratuit") row.plan_activated_at = now;
  const { error } = await admin
    .from("restaurant_subscriptions")
    .upsert(row, { onConflict: "restaurant_id" });
  if (error) throw new Error(error.message);
}
