import { createAdminClient } from "./supabase";

// Rate-limit générique adossé à Postgres (RPC check_rate_limit, m44 / F8).
//
// FAIL-OPEN : si la migration n'est pas encore appliquée (RPC/table absents) ou
// en cas d'erreur, on AUTORISE — la protection s'active une fois m44 en place,
// sans jamais bloquer un utilisateur légitime entre-temps. Acceptable car il
// s'agit d'un garde-fou anti-abus/coût, pas d'un contrôle de sécurité dur.
export async function checkRateLimit(
  userId: string,
  action: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId,
      p_action: action,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return true; // fail-open (ex. migration non appliquée)
    return data !== false;
  } catch {
    return true; // fail-open
  }
}
