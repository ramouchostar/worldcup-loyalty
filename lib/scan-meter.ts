import { createAdminClient } from "./supabase";
import type { Plan } from "./entitlements";

// ADR 0029 §6 (Phase 3) — métering des scans OCR par établissement/mois.
// Le plafond Gratuit = couverture du coût OCR, JAMAIS une punition :
// - le membre n'est jamais bloqué en plein scan ;
// - le resto n'est jamais coupé — au-dessus du plafond, la console affiche
//   un nudge de croissance POSITIF vers le plan Croissance.
// Point de mesure unique : l'aperçu OCR (/api/orders/parse-receipt), proxy
// fidèle du coût (la ré-analyse serveur à la soumission est ~1:1).
// Best-effort/fail-open partout (même philosophie que lib/rate-limit.ts).

// ⚠️ À CALER avant lancement (ADR 0029 §6) : plafond mensuel du plan Gratuit,
// calibré sur le coût OCR réel — généreux, jamais atteint par un petit resto.
export const SCAN_CAP_GRATUIT = 400;

export type ScanUsage = {
  month: string; // 'YYYY-MM'
  count: number;
  cap: number | null; // null = plans payants (larges/illimités)
  over: boolean;
};

// Mois calendaire belge (les scans sont des actes de comptoir, pas des
// instants UTC) — même logique que todayInBrussels() (lib/broadcast.ts).
export function currentMonthInBrussels(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" }).slice(0, 7);
}

// Incrémente le compteur du mois courant. Best-effort : jamais propagé, un
// échec de métering ne doit jamais faire échouer un scan de membre.
export async function recordScan(restaurantId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("record_scan", {
      p_restaurant_id: restaurantId,
      p_month: currentMonthInBrussels(),
    });
    if (error) throw error;
  } catch (e) {
    // m52 pas encore appliquée / panne — le scan continue sans compter.
    console.error("[scan-meter] recordScan failed:", (e as Error).message);
  }
}

// Usage du mois courant + position vs plafond du plan. Fail-open : erreur →
// count 0, jamais de nudge fantôme.
export async function getScanUsage(restaurantId: string, plan: Plan): Promise<ScanUsage> {
  const month = currentMonthInBrussels();
  const cap = plan === "gratuit" ? SCAN_CAP_GRATUIT : null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("scan_meter")
      .select("count")
      .eq("restaurant_id", restaurantId)
      .eq("month", month)
      .maybeSingle();
    if (error) throw error;
    const count = (data as { count: number } | null)?.count ?? 0;
    return { month, count, cap, over: cap !== null && count > cap };
  } catch (e) {
    console.error("[scan-meter] getScanUsage failed:", (e as Error).message);
    return { month, count: 0, cap, over: false };
  }
}
