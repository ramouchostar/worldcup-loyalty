import { createAdminClient } from "./supabase";
import { getRestaurantId } from "./restaurant";
import { sendPush, sendWhatsApp } from "./notifications";
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

export async function sendBroadcast(message: string, target: BroadcastTarget): Promise<BroadcastResult> {
  const admin = createAdminClient();
  const restaurantId = getRestaurantId();

  const teamIds = await resolveTeamIds(admin, restaurantId, target);
  if (teamIds.length === 0) return { targeted: 0, sent: 0, skipped: 0 };

  const { data: membersRaw } = await admin
    .from("profiles")
    .select("id, phone")
    .eq("restaurant_id", restaurantId)
    .in("team_id", teamIds);
  const members = (membersRaw ?? []) as { id: string; phone: string | null }[];

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
