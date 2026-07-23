import { createAdminClient } from "./supabase";
import type { ConsentPurpose } from "@/types";

// ADR 0022 — Consentements RGPD. Journal APPEND-ONLY : on n'écrase jamais,
// chaque changement ajoute une ligne (preuve, art. 7). Le consentement courant
// pour (user, purpose) = la ligne la plus récente.

export const PRIVACY_POLICY_VERSION = "1.0";

export const CONSENT_PURPOSES: ConsentPurpose[] = [
  "programme",
  "marketing_push",
  "marketing_whatsapp",
  "insights_commerciaux",
  "zones",
];

export type ConsentMap = Record<ConsentPurpose, boolean>;

type Admin = ReturnType<typeof createAdminClient>;

function emptyMap(): ConsentMap {
  return {
    programme: false,
    marketing_push: false,
    marketing_whatsapp: false,
    insights_commerciaux: false,
    zones: false,
  };
}

export async function recordConsents(
  userId: string,
  entries: Partial<Record<ConsentPurpose, boolean>>,
  source: string,
  admin?: Admin
): Promise<void> {
  const client = admin ?? createAdminClient();
  const rows = (Object.entries(entries) as [ConsentPurpose, boolean][])
    .filter(([p, g]) => CONSENT_PURPOSES.includes(p) && typeof g === "boolean")
    .map(([purpose, granted]) => ({
      user_id: userId,
      purpose,
      granted,
      policy_version: PRIVACY_POLICY_VERSION,
      source,
    }));
  if (rows.length === 0) return;
  const { error } = await client.from("consents").insert(rows);
  if (error) throw new Error(`recordConsents: ${error.message}`);
}

// Consentement courant par finalité = la ligne la plus récente.
export async function getCurrentConsents(userId: string, admin?: Admin): Promise<ConsentMap> {
  const client = admin ?? createAdminClient();
  const { data } = await client
    .from("consents")
    .select("purpose, granted, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const map = emptyMap();
  const seen = new Set<string>();
  for (const row of (data ?? []) as { purpose: ConsentPurpose; granted: boolean }[]) {
    if (seen.has(row.purpose)) continue;
    seen.add(row.purpose);
    map[row.purpose] = row.granted;
  }
  return map;
}

export async function hasConsent(userId: string, purpose: ConsentPurpose, admin?: Admin): Promise<boolean> {
  return (await getCurrentConsents(userId, admin))[purpose];
}

// Sous-ensemble des utilisateurs dont le consentement COURANT pour `purpose`
// est accordé — une seule requête pour tout le lot (pas de N+1).
export async function getConsentingUserIds(
  userIds: string[],
  purpose: ConsentPurpose,
  admin?: Admin
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const client = admin ?? createAdminClient();
  const { data } = await client
    .from("consents")
    .select("user_id, granted, created_at")
    .in("user_id", userIds)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false });

  const granted = new Set<string>();
  const seen = new Set<string>();
  for (const row of (data ?? []) as { user_id: string; granted: boolean }[]) {
    if (seen.has(row.user_id)) continue; // ne garder que la ligne la plus récente
    seen.add(row.user_id);
    if (row.granted) granted.add(row.user_id);
  }
  return granted;
}
