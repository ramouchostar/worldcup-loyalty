import { createHash } from "node:crypto";
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

// ADR 0045 — même mécanique que checkRateLimit, mais pour un appelant sans
// user_id (visiteur anonyme, ex. l'aperçu OCR ouvert avant création de
// compte). Clé = hash SHA-256 de l'IP, jamais l'IP en clair en base
// (table ip_rate_limits, migration 20260831-1029).
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export async function checkIpRateLimit(
  ipHash: string,
  action: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_ip_rate_limit", {
      p_ip_hash: ipHash,
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
