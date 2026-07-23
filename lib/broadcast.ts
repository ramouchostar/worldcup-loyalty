import { createAdminClient } from "./supabase";
import { sendPush, sendWhatsApp } from "./notifications";
import { getConsentingUserIds } from "./consent";
import type { TeamType } from "@/types";

// ADR 0014 — Broadcast admin : notification composée par le restaurateur,
// ciblée par équipe(s) ou par type(s) d'équipe. Enveloppe anti-spam dédiée
// (2/semaine/membre), séparée des notifications automatiques (ADR 0009).

const BROADCAST_MAX_PER_WEEK = 2;

export type BroadcastTarget =
  | { kind: "all" }
  | { kind: "teams"; teamIds: string[] }
  | { kind: "types"; types: TeamType[] };

export type BroadcastResult = { targeted: number; sent: number; skipped: number };

type Admin = ReturnType<typeof createAdminClient>;

// Équipes communautaires visées (toujours bornées à l'établissement courant)
async function resolveTeamIds(admin: Admin, restaurantId: string, target: BroadcastTarget): Promise<string[]> {
  if (target.kind === "teams") return target.teamIds;
  let query = admin.from("teams").select("id").eq("restaurant_id", restaurantId).eq("is_active", true);
  if (target.kind === "types") query = query.in("type", target.types);
  const { data } = await query;
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

// ─── Broadcasts programmés (ADR 0023) ────────────────────────────────────────

// Une annonce de promo part à J-1/J-2 du jour visé, pas au moment où le
// restaurateur accepte la suggestion. La ligne attend dans
// scheduled_broadcasts ; le cron quotidien envoie ce qui est dû via
// sendBroadcast (même pipeline, même enveloppe anti-spam).

export type ScheduledBroadcast = {
  id: string;
  restaurant_id: string;
  message: string;
  target: BroadcastTarget;
  send_on: string;
  promo_on: string | null;
  created_at: string;
  sent_at: string | null;
  result: BroadcastResult | null;
};

// Aujourd'hui (YYYY-MM-DD) dans le fuseau des établissements — les dates
// d'envoi/promo sont des jours calendaires belges, pas des instants UTC.
export function todayInBrussels(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

export async function scheduleBroadcast(
  message: string,
  target: BroadcastTarget,
  restaurantId: string,
  sendOn: string,
  promoOn: string | null,
  createdBy: string | null
): Promise<ScheduledBroadcast> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scheduled_broadcasts")
    .insert({
      restaurant_id: restaurantId,
      message,
      target,
      send_on: sendOn,
      promo_on: promoOn,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ScheduledBroadcast;
}

export async function listScheduledBroadcasts(restaurantId: string): Promise<ScheduledBroadcast[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("scheduled_broadcasts")
    .select()
    .eq("restaurant_id", restaurantId)
    .order("send_on", { ascending: false })
    .limit(20);
  return (data ?? []) as ScheduledBroadcast[];
}

// Annulation : uniquement tant que l'envoi n'a pas eu lieu.
export async function cancelScheduledBroadcast(id: string, restaurantId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("scheduled_broadcasts")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .is("sent_at", null)
    .select("id");
  return (data ?? []).length > 0;
}

// Envoie tout ce qui est dû (send_on ≤ aujourd'hui, jamais envoyé). Le
// marquage sent_at AVANT l'envoi rend le cron ré-entrant : une ligne prise
// par un run n'est jamais reprise par un autre.
export async function processDueScheduledBroadcasts(
  today: string
): Promise<{ due: number; sent: number }> {
  const admin = createAdminClient();
  const { data: dueRaw } = await admin
    .from("scheduled_broadcasts")
    .select("id, restaurant_id, message, target")
    .lte("send_on", today)
    .is("sent_at", null);
  const due = (dueRaw ?? []) as Pick<ScheduledBroadcast, "id" | "restaurant_id" | "message" | "target">[];

  let sent = 0;
  for (const row of due) {
    const { data: claimed } = await admin
      .from("scheduled_broadcasts")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("sent_at", null)
      .select("id");
    if ((claimed ?? []).length === 0) continue; // pris par un run concurrent

    const result = await sendBroadcast(row.message, row.target, row.restaurant_id);
    await admin.from("scheduled_broadcasts").update({ result }).eq("id", row.id);
    sent++;
  }
  return { due: due.length, sent };
}

export async function sendBroadcast(
  message: string,
  target: BroadcastTarget,
  restaurantId: string
): Promise<BroadcastResult> {
  const admin = createAdminClient();

  const teamIds = await resolveTeamIds(admin, restaurantId, target);
  if (teamIds.length === 0) return { targeted: 0, sent: 0, skipped: 0 };

  // ADR 0015 — l'appartenance à une équipe vit dans memberships, pas
  // profiles.team_id (obsolète, plus mis à jour depuis le pivot).
  const { data: membersRaw } = await admin
    .from("memberships")
    .select("user_id, profiles!inner(phone)")
    .eq("restaurant_id", restaurantId)
    .in("team_id", teamIds);
  const allMembers = ((membersRaw ?? []) as unknown as { user_id: string; profiles: { phone: string | null } }[])
    .map((m) => ({ id: m.user_id, phone: m.profiles.phone }));

  // ADR 0022 — garde-fou : n'envoyer qu'aux membres ayant consenti au marketing.
  // (À l'inscription comme dans /compte, push et WhatsApp sont couplés en un
  // seul opt-in « marketing ».)
  const optedIn = await getConsentingUserIds(allMembers.map((x) => x.id), "marketing_push", admin);
  const members = allMembers.filter((m) => optedIn.has(m.id));

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  let sent = 0;
  let skipped = 0;

  for (const m of members) {
    // Enveloppe dédiée : 2 broadcasts/semaine/membre max
    const { count } = await admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", m.id)
      .eq("trigger_type", "admin_broadcast")
      .gte("sent_at", weekAgo);
    if ((count ?? 0) >= BROADCAST_MAX_PER_WEEK) {
      skipped++;
      continue;
    }

    // Push (gratuit) → WhatsApp (fallback) → in-app (journal lu à l'ouverture)
    let channel: "push" | "whatsapp" | "in_app" = "in_app";
    const pushed = await sendPush(m.id, restaurantId, message);
    if (pushed) channel = "push";
    else if (m.phone) {
      const wa = await sendWhatsApp(m.phone, message);
      if (wa) channel = "whatsapp";
    }

    // Journalise SANS toucher profiles.last_notified_at (sinon les notifs
    // automatiques seraient suspendues) → enveloppes bien séparées.
    await admin.from("notification_log").insert({
      user_id: m.id,
      restaurant_id: restaurantId,
      trigger_type: "admin_broadcast",
      channel,
      community_score_at_send: null,
      message_body: message,
    });
    sent++;
  }

  return { targeted: members.length, sent, skipped };
}
