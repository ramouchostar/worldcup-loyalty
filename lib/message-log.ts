import { createAdminClient } from "./supabase";
import type { MessageAudience } from "./message-catalog";
import type { ResendEventType } from "./resend-webhook";

// Journal des messages (ADR 0063 §6, migration 20260921-1615) : une ligne par
// tentative d'envoi — réussie, ratée ou volontairement retenue (témoin).
// SERVEUR UNIQUEMENT (service role). Tout est fail-open : sans la migration,
// les envois partent comme avant et rien ne casse ; le journal manque, et la
// page /platform/messages le dit.

export type SendChannel = "email" | "push" | "whatsapp" | "in_app" | "none";
export type SendStatus = "sent" | "failed" | "holdout";

export type SendRecord = {
  id?: string;
  restaurantId?: string | null;
  audience: MessageAudience;
  userId?: string | null;
  messageKey: string;
  step?: number | null;
  campaignId?: string | null;
  channel: SendChannel;
  status: SendStatus;
  providerId?: string | null;
  error?: string | null;
  subject?: string | null;
};

// Postgres « relation inconnue » / PostgREST « table absente du cache ».
export function isMissingJournal(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /message_sends|message_settings/.test(error.message ?? "");
}

export async function recordSend(r: SendRecord): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("message_sends")
      .insert({
        ...(r.id ? { id: r.id } : {}),
        restaurant_id: r.restaurantId ?? null,
        audience: r.audience,
        user_id: r.userId ?? null,
        message_key: r.messageKey,
        step: r.step ?? null,
        campaign_id: r.campaignId ?? null,
        channel: r.channel,
        status: r.status,
        provider_id: r.providerId ?? null,
        error: r.error ? r.error.slice(0, 500) : null,
        subject: r.subject ? r.subject.slice(0, 200) : null,
      })
      .select("id")
      .single();
    if (error) {
      if (!isMissingJournal(error)) console.error("recordSend:", error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.error("recordSend threw:", err);
    return null;
  }
}

export async function recordClick(sendId: string): Promise<void> {
  try {
    await createAdminClient().rpc("record_message_click", { p_id: sendId });
  } catch (err) {
    console.error("recordClick threw:", err);
  }
}

// Un événement Resend met à jour la ligne de l'envoi correspondant. Un rebond
// ou une plainte l'emporte sur « délivré » ; les dates restent toutes.
export async function applyProviderEvent(providerId: string, event: ResendEventType, at: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const fail = (error: { code?: string; message?: string }) => {
      if (!isMissingJournal(error)) console.error("applyProviderEvent:", error.message);
      return false;
    };
    if (event === "delivered") {
      // La date toujours ; le statut seulement s'il était encore « envoyé » —
      // « délivré » ne recouvre jamais un rebond ou une plainte arrivés avant.
      const { error } = await admin.from("message_sends").update({ delivered_at: at }).eq("provider_id", providerId);
      if (error) return fail(error);
      await admin.from("message_sends").update({ status: "delivered" }).eq("provider_id", providerId).eq("status", "sent");
      return true;
    }
    const patch = event === "bounced" ? { bounced_at: at, status: "bounced" } : { complained_at: at, status: "complained" };
    const { error } = await admin.from("message_sends").update(patch).eq("provider_id", providerId);
    return error ? fail(error) : true;
  } catch (err) {
    console.error("applyProviderEvent threw:", err);
    return false;
  }
}

// ─── Interrupteurs séquence × établissement (ADR 0063 §2) ──────────────────

// Éteint par défaut : aucune ligne, table absente ou erreur → false.
export async function isMessageEnabled(messageKey: string, restaurantId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from("message_settings")
      .select("enabled")
      .eq("message_key", messageKey)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (error) return false;
    return (data as { enabled: boolean } | null)?.enabled === true;
  } catch {
    return false;
  }
}

export type MessageSetting = { message_key: string; restaurant_id: string; enabled: boolean; updated_at: string };

export async function listMessageSettings(): Promise<{ settings: MessageSetting[]; available: boolean }> {
  try {
    const { data, error } = await createAdminClient()
      .from("message_settings")
      .select("message_key, restaurant_id, enabled, updated_at");
    if (error) return { settings: [], available: !isMissingJournal(error) };
    return { settings: (data ?? []) as MessageSetting[], available: true };
  } catch {
    return { settings: [], available: false };
  }
}

export async function setMessageEnabled(
  messageKey: string,
  restaurantId: string,
  enabled: boolean,
  updatedBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient()
    .from("message_settings")
    .upsert(
      { message_key: messageKey, restaurant_id: restaurantId, enabled, updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: "message_key,restaurant_id" }
    );
  if (error) {
    return { ok: false, error: isMissingJournal(error) ? "Migration 20260921-1615 à appliquer." : error.message };
  }
  return { ok: true };
}

// ─── Arrêt d'une séquence par son destinataire (migration 20260921-2119) ───

export type OptOutSource = "lien" | "un_clic" | "compte";

// Les arrêts d'un groupe de personnes. `available: false` quand la table
// manque : le moteur n'envoie alors RIEN (on ne relance pas quelqu'un dont on
// ne peut pas lire le « stop »).
export async function listOptOuts(userIds: string[]): Promise<{ byUser: Map<string, Set<string>>; available: boolean }> {
  const byUser = new Map<string, Set<string>>();
  if (userIds.length === 0) return { byUser, available: true };
  try {
    const admin = createAdminClient();
    for (let i = 0; i < userIds.length; i += 500) {
      const { data, error } = await admin
        .from("message_optouts")
        .select("user_id, message_key")
        .in("user_id", userIds.slice(i, i + 500));
      if (error) return { byUser, available: false };
      for (const r of (data ?? []) as { user_id: string; message_key: string }[]) {
        const set = byUser.get(r.user_id) ?? new Set<string>();
        set.add(r.message_key);
        byUser.set(r.user_id, set);
      }
    }
    return { byUser, available: true };
  } catch {
    return { byUser, available: false };
  }
}

// L'envoi derrière un lien d'arrêt : l'identifiant d'envoi (UUID) prouve que
// la personne a reçu l'e-mail — pas besoin d'être connecté pour dire stop.
export async function getSendForStop(sendId: string): Promise<{ userId: string; messageKey: string; restaurantId: string | null } | null> {
  try {
    const { data } = await createAdminClient()
      .from("message_sends")
      .select("user_id, message_key, restaurant_id")
      .eq("id", sendId)
      .maybeSingle();
    const row = data as { user_id: string | null; message_key: string; restaurant_id: string | null } | null;
    if (!row?.user_id) return null;
    return { userId: row.user_id, messageKey: row.message_key, restaurantId: row.restaurant_id };
  } catch {
    return null;
  }
}

export async function isOptedOut(userId: string, messageKey: string): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from("message_optouts")
      .select("user_id")
      .eq("user_id", userId)
      .eq("message_key", messageKey)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function recordOptOut(userId: string, messageKey: string, source: OptOutSource): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from("message_optouts")
      .upsert({ user_id: userId, message_key: messageKey, source }, { onConflict: "user_id,message_key", ignoreDuplicates: true });
    if (error) console.error("recordOptOut:", error.message);
    return !error;
  } catch (err) {
    console.error("recordOptOut threw:", err);
    return false;
  }
}
