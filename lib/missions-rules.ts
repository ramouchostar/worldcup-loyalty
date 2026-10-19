import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { CURRENT_RULES_VERSIONS, RULES_VERSION, readAcceptance } from "./mission-rules";

// ============================================================
// Réserver un prestataire (ADR 0084 §3, PR N) — la preuve qu'on a accepté les règles : qui, quand, quelle version.
//
// Restaurateur : une acceptation par brief envoyé (l'appelant en laisse aussi la ligne dans `mission_events`).
// Prestataire : une par version, exigée avant son premier devis. FAIL-OPEN : migration 20261014-1000 absente → on le dit
// dans le journal, et le prestataire n'est pas bloqué faute de pouvoir lire son acceptation (le restaurateur, lui,
// coche toujours la case : elle est exigée par la route, pas par la base).
// ============================================================

type DbError = { code?: string; message?: string } | null;

/** Garde la preuve de l'acceptation d'un restaurateur. Ne lève jamais : retourne faux si elle n'a pas pu être écrite (déjà tracée par l'appelant). */
export async function recordRestaurantAcceptance(missionId: string, restaurantId: string, userId: string, version: string = RULES_VERSION): Promise<boolean> {
  try {
    const { error } = await createAdminClient().from("rules_acceptances").insert({ audience: "restaurant", version, user_id: userId, restaurant_id: restaurantId, mission_id: missionId });
    if (error && error.code !== "23505") throw error; // 23505 : déjà acceptée (deux clics)
    return true;
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-rules] recordRestaurantAcceptance failed:", (e as Error).message);
    return false;
  }
}

/** Le prestataire a-t-il accepté la version EN VIGUEUR ? `ok: false` = on ne sait pas (migration absente) : ne pas bloquer. */
export async function providerHasAccepted(providerId: string, version: string = RULES_VERSION): Promise<{ ok: true; accepted: boolean } | { ok: false }> {
  try {
    const { data, error } = await createAdminClient().from("rules_acceptances").select("id").eq("audience", "provider").eq("provider_id", providerId).eq("version", version).limit(1);
    if (error) throw error;
    return { ok: true, accepted: (data?.length ?? 0) > 0 };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-rules] providerHasAccepted failed:", (e as Error).message);
    return { ok: false };
  }
}

export type AcceptResult = { ok: true } | { ok: false; reason: "not_accepted" | "outdated" | "unavailable" };

export async function acceptAsProvider(providerId: string, raw: unknown): Promise<AcceptResult> {
  // Une version en vigueur, celle du tournage ou celle de l'atelier : la page montre les règles du métier de la mission.
  const asked = raw && typeof raw === "object" ? (raw as { version?: unknown }).version : undefined;
  const version = typeof asked === "string" && CURRENT_RULES_VERSIONS.includes(asked) ? asked : RULES_VERSION;
  const read = readAcceptance(raw, version);
  if (!read.ok) return { ok: false, reason: read.reason };
  try {
    const { error } = await createAdminClient().from("rules_acceptances").insert({ audience: "provider", version: read.acceptance.version, provider_id: providerId });
    if (error && error.code !== "23505") throw error;
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-rules] acceptAsProvider failed:", (e as Error).message);
    return { ok: false, reason: "unavailable" };
  }
}
