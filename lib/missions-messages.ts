import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { getMission, logEvent } from "./missions";
import { getForProvider } from "./provider-missions";
import type { ProviderRow } from "./providers";
import { mailMission } from "./missions-notify";
import { BODY_ISSUE_TEXT, MAX_PER_HOUR, contactsUnlocked, judgeSend, maskContacts, sanitizeBody, shouldNotify, validateBody, type BodyIssue, type Sender } from "./mission-messages";

// ============================================================
// Réserver un prestataire (ADR 0084, PR Q) — la messagerie d'une mission : lire, écrire, marquer lu, prévenir l'autre.
//
// Les règles (masquage des contacts, limite d'envoi, quand prévenir) vivent dans lib/mission-messages.ts (pures, testées) ;
// ce fichier les applique. Un contact masqué laisse sa ligne dans `mission_events` (la trace : combien tentent de sortir de
// la plateforme). L'e-mail de notification ne dit jamais le contenu. FAIL-OPEN : migration 20261020-1000 absente →
// « unavailable », rien n'est écrit à moitié.
// ============================================================

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

export type MessageActor = { kind: "restaurant"; restaurantId: string; userId: string } | { kind: "provider"; provider: ProviderRow };
export type MessageView = { id: string; sender: Sender; body: string; at: string; masked: boolean };

const actorId = (a: MessageActor) => (a.kind === "restaurant" ? a.userId : (a.provider.user_id ?? undefined));
const other = (k: "restaurant" | "provider"): "restaurant" | "provider" => (k === "restaurant" ? "provider" : "restaurant");

async function statusOf(actor: MessageActor, missionId: string): Promise<{ ok: true; status: string | null } | typeof unavailable> {
  if (actor.kind === "restaurant") {
    const f = await getMission(missionId, actor.restaurantId);
    return f.ok ? { ok: true, status: f.mission?.status ?? null } : unavailable;
  }
  const f = await getForProvider(missionId, actor.provider.id);
  return f.ok ? { ok: true, status: f.mission?.status ?? null } : unavailable;
}

// ── Lire ─────────────────────────────────────────────────────

/** Le fil d'une mission, du plus ancien au plus récent. Les parties lisent le texte masqué ; la plateforme lit l'original. */
export async function listMessages(missionId: string, as: "restaurant" | "provider" | "platform"): Promise<MessageView[]> {
  try {
    const { data, error } = await createAdminClient().from("mission_messages").select("id, sender, body, body_original, masked, created_at").eq("mission_id", missionId).order("created_at", { ascending: true }).limit(500);
    if (error) throw error;
    return ((data ?? []) as { id: string; sender: Sender; body: string; body_original: string | null; masked: boolean; created_at: string }[]).map((m) => ({
      id: m.id,
      sender: m.sender,
      body: as === "platform" && m.body_original ? m.body_original : m.body,
      at: m.created_at,
      masked: m.masked,
    }));
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-messages] listMessages failed:", (e as Error).message);
    return [];
  }
}

/** Les messages non lus de chaque mission, pour les listes (un seul aller-retour). */
export async function unreadCounts(missionIds: readonly string[], reader: "restaurant" | "provider"): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (missionIds.length === 0) return out;
  try {
    const admin = createAdminClient();
    const [{ data: msgs, error: e1 }, { data: reads, error: e2 }] = await Promise.all([
      admin.from("mission_messages").select("mission_id, sender, created_at").in("mission_id", [...missionIds]).neq("sender", reader),
      admin.from("mission_message_reads").select("mission_id, last_read_at").eq("reader", reader).in("mission_id", [...missionIds]),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const readAt = new Map(((reads ?? []) as { mission_id: string; last_read_at: string | null }[]).map((r) => [r.mission_id, r.last_read_at]));
    for (const m of (msgs ?? []) as { mission_id: string; created_at: string }[]) {
      const last = readAt.get(m.mission_id);
      if (!last || m.created_at > last) out.set(m.mission_id, (out.get(m.mission_id) ?? 0) + 1);
    }
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-messages] unreadCounts failed:", (e as Error).message);
  }
  return out;
}

export async function markRead(actor: MessageActor, missionId: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "unavailable" }> {
  const s = await statusOf(actor, missionId);
  if (!s.ok) return unavailable;
  if (!s.status) return { ok: false, reason: "not_found" };
  try {
    const { error } = await createAdminClient().from("mission_message_reads").upsert({ mission_id: missionId, reader: actor.kind, last_read_at: new Date().toISOString() }, { onConflict: "mission_id,reader" });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-messages] markRead failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Écrire ───────────────────────────────────────────────────

export type SendResult =
  | { ok: true; message: MessageView; masked: boolean }
  | { ok: false; reason: "not_found" | "closed" | "rate_limited" | "unavailable" }
  | { ok: false; reason: "invalid"; issue: BodyIssue };

export async function sendMessage(actor: MessageActor, missionId: string, raw: unknown): Promise<SendResult> {
  const s = await statusOf(actor, missionId);
  if (!s.ok) return unavailable;
  if (!s.status) return { ok: false, reason: "not_found" };

  const body = sanitizeBody(raw);
  const issue = validateBody(body);
  if (issue) return { ok: false, reason: "invalid", issue };

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count, error: ce } = await admin.from("mission_messages").select("id", { count: "exact", head: true }).eq("mission_id", missionId).eq("sender", actor.kind).gte("created_at", since);
    if (ce) throw ce;
    const verdict = judgeSend(s.status, count ?? 0);
    if (verdict !== "ok") {
      if (verdict === "rate_limited") await logEvent(missionId, { kind: "message_refused", actorKind: actor.kind, actorId: actorId(actor), reason: "rate_limited", meta: { perHour: MAX_PER_HOUR } });
      return { ok: false, reason: verdict };
    }

    const masking = contactsUnlocked(s.status) ? null : maskContacts(body);
    const masked = !!masking?.masked;
    const { data, error } = await admin
      .from("mission_messages")
      .insert({ mission_id: missionId, sender: actor.kind, sender_id: actorId(actor) ?? null, body: (masked ? masking!.text : body).slice(0, 3000), body_original: masked ? body : null, masked })
      .select("id, created_at")
      .single();
    if (error) throw error;
    const row = data as { id: string; created_at: string };
    if (masked) await logEvent(missionId, { kind: "message_masked", actorKind: actor.kind, actorId: actorId(actor), meta: { ...masking!.found } });
    await notifyOther(actor.kind, missionId, row.created_at);
    return { ok: true, masked, message: { id: row.id, sender: actor.kind, body: masked ? masking!.text : body, at: row.created_at, masked } };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-messages] sendMessage failed:", (e as Error).message);
    return unavailable;
  }
}

/** Prévient l'autre partie par e-mail (sans le contenu), au plus une fois par tranche de 30 minutes et jamais s'il a déjà lu. */
async function notifyOther(from: "restaurant" | "provider", missionId: string, messageAt: string): Promise<void> {
  const to = other(from);
  try {
    const admin = createAdminClient();
    await admin.from("mission_message_reads").upsert({ mission_id: missionId, reader: to }, { onConflict: "mission_id,reader", ignoreDuplicates: true });
    const { data, error } = await admin.from("mission_message_reads").select("last_read_at, last_notified_at").eq("mission_id", missionId).eq("reader", to).maybeSingle();
    if (error) throw error;
    const r = data as { last_read_at: string | null; last_notified_at: string | null } | null;
    if (!r || !shouldNotify({ lastReadAt: r.last_read_at, lastNotifiedAt: r.last_notified_at, messageAt, now: new Date() })) return;
    // Réserver AVANT d'envoyer : deux messages en même temps n'envoient qu'un e-mail.
    const now = new Date().toISOString();
    let claim = admin.from("mission_message_reads").update({ last_notified_at: now }).eq("mission_id", missionId).eq("reader", to);
    claim = r.last_notified_at === null ? claim.is("last_notified_at", null) : claim.eq("last_notified_at", r.last_notified_at);
    const { data: won } = await claim.select("mission_id");
    if (!won || won.length === 0) return;
    await mailMission(missionId, to, "message_received");
  } catch (e) {
    console.error("[missions-messages] notifyOther failed:", (e as Error).message);
    await logEvent(missionId, { kind: "notify_failed", actorKind: "system", reason: (e as Error).message, meta: { about: "message_received" } });
  }
}

export { BODY_ISSUE_TEXT };
