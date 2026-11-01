import { createAdminClient } from "../supabase";
import { getPlan } from "../entitlements";
import { resolveAdFee, type AdFee } from "../service-offers";

// ADR 0086 amendé le 2026-11-01 — les frais Pub d'un établissement : son taux
// négocié s'il en a un, sinon le tarif de son forfait. Serveur uniquement.
// Fail-open : colonne absente ou panne → tarif du forfait, jamais un blocage.
export async function getAdFee(restaurantId: string): Promise<AdFee> {
  const plan = await getPlan(restaurantId);
  try {
    const { data, error } = await createAdminClient()
      .from("restaurant_subscriptions")
      .select("ad_fee_pct, status")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (error) throw error;
    const row = data as { ad_fee_pct: number | string | null; status: string } | null;
    return resolveAdFee(plan, row && row.status === "active" ? (row.ad_fee_pct as number | null) : null);
  } catch (e) {
    console.error("[ads/fee] lecture du taux négocié impossible :", (e as Error).message);
    return resolveAdFee(plan, null);
  }
}
