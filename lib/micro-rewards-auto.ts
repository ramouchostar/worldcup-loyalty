import { createAdminClient } from "./supabase";

// ============================================================
// Actions sociales validées automatiquement (décision du porteur, 2026-09-18).
//
// Vérifier qu'un client a vraiment laissé un avis ou suivi un compte est
// quasiment impossible, et les restaurateurs n'ont pas le temps de le faire.
// Une action réclamée est donc validée toute seule après un délai : le
// client voit « vérification en cours », puis son jeton arrive (même
// illusion de contrôle que pour les tickets, ADR 0008). Le restaurateur peut
// toujours refuser une action pendant ce délai depuis sa console.
//
// Joué par le passage horaire (/api/cron/expire-rewards).
// ============================================================

export const SOCIAL_ACTION_AUTO_VALIDATE_HOURS = 4;

/** Instant avant lequel une action en attente est validée automatiquement. */
export function autoValidateCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - SOCIAL_ACTION_AUTO_VALIDATE_HOURS * 3_600_000).toISOString();
}

export async function autoValidateSocialActions(now: Date = new Date()): Promise<{ validated: number }> {
  const admin = createAdminClient();
  // `status = 'pending'` est aussi la garde de course : une action refusée
  // entre-temps par le restaurateur n'est jamais validée.
  const { data, error } = await admin
    .from("micro_reward_claims")
    .update({ status: "validated" })
    .eq("status", "pending")
    .lt("claimed_at", autoValidateCutoff(now))
    .select("id, user_id, restaurant_id");
  if (error) throw new Error(`micro_reward_claims(auto-validate): ${error.message}`);

  // ADR 0012 — le jeton accordé peut compléter un cadeau 4 jetons : son coût
  // entre alors dans le budget du mois (même appel que la validation manuelle).
  const { recordJetonsGiftCostIfEarned } = await import("./jetons-gift");
  for (const claim of (data ?? []) as { user_id: string | null; restaurant_id: string }[]) {
    if (claim.user_id) await recordJetonsGiftCostIfEarned(claim.restaurant_id, claim.user_id);
  }
  return { validated: (data ?? []).length };
}
