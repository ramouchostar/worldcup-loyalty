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

// ADR 0039 — nature du message, qui décide de sa base légale et de son public.
//   service : information liée au programme auquel le membre a adhéré
//             (cadeau prêt, incident, changement de règle) → exécution du
//             contrat, tous les membres la reçoivent.
//   promo   : offre commerciale → consentement marketing exigé.
export type BroadcastNature = "service" | "promo";

export type BroadcastResult = { targeted: number; sent: number; skipped: number };

type Admin = ReturnType<typeof createAdminClient>;
type Membre = { id: string; phone: string | null };

// Équipes communautaires visées (toujours bornées à l'établissement courant)
async function resolveTeamIds(admin: Admin, restaurantId: string, target: BroadcastTarget): Promise<string[]> {
  if (target.kind === "teams") return target.teamIds;
  let query = admin.from("teams").select("id").eq("restaurant_id", restaurantId).eq("is_active", true);
  if (target.kind === "types") query = query.in("type", target.types);
  const { data } = await query;
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/**
 * Membres visés (ADR 0039 §1).
 *
 * « Tous » veut dire **tous les membres de l'établissement**, avec ou sans
 * équipe — c'est le canal général. Avant, cette option résolvait « toutes les
 * équipes » puis filtrait `memberships.team_id IN (…)` : à Kraainem le
 * 21/08/2026, 13 membres sur 16 n'ayant pas d'équipe, un envoi « à tous »
 * touchait 1 personne. Même défaut que l'ADR 0034, côté sortant.
 *
 * Les ciblages par équipe(s) ou par type restent, eux, bornés aux équipes :
 * c'est leur raison d'être (ADR 0014).
 */
async function resolveAudience(
  admin: Admin,
  restaurantId: string,
  target: BroadcastTarget
): Promise<Membre[]> {
  let query = admin
    .from("memberships")
    .select("user_id, profiles!inner(phone)")
    .eq("restaurant_id", restaurantId);

  if (target.kind !== "all") {
    const teamIds = await resolveTeamIds(admin, restaurantId, target);
    if (teamIds.length === 0) return [];
    query = query.in("team_id", teamIds);
  }

  const { data } = await query;
  // ADR 0015 — l'appartenance vit dans memberships, pas profiles.team_id
  // (obsolète, plus mis à jour depuis le pivot).
  return ((data ?? []) as unknown as { user_id: string; profiles: { phone: string | null } }[])
    .map((m) => ({ id: m.user_id, phone: m.profiles.phone }));
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
  // Absente tant que la migration du 21/08 n'est pas appliquée → 'promo'.
  nature?: BroadcastNature;
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
  createdBy: string | null,
  nature: BroadcastNature = "promo"
): Promise<ScheduledBroadcast> {
  const admin = createAdminClient();
  const ligne = {
    restaurant_id: restaurantId,
    message,
    target,
    send_on: sendOn,
    promo_on: promoOn,
    created_by: createdBy,
  };

  const { data, error } = await admin
    .from("scheduled_broadcasts")
    .insert({ ...ligne, nature })
    .select()
    .single();
  if (!error) return data as ScheduledBroadcast;

  // Fail-open : sans la migration du 21/08, la colonne `nature` n'existe pas.
  // L'annonce part quand même — en promo, le comportement d'avant.
  const { data: repli, error: repliError } = await admin
    .from("scheduled_broadcasts")
    .insert(ligne)
    .select()
    .single();
  if (repliError) throw new Error(repliError.message);
  return repli as ScheduledBroadcast;
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
    .select("*")
    .lte("send_on", today)
    .is("sent_at", null);
  const due = (dueRaw ?? []) as ScheduledBroadcast[];

  let sent = 0;
  for (const row of due) {
    const { data: claimed } = await admin
      .from("scheduled_broadcasts")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("sent_at", null)
      .select("id");
    if ((claimed ?? []).length === 0) continue; // pris par un run concurrent

    const result = await sendBroadcast(row.message, row.target, row.restaurant_id, row.nature ?? "promo");
    await admin.from("scheduled_broadcasts").update({ result }).eq("id", row.id);
    sent++;
  }
  return { due: due.length, sent };
}

export async function sendBroadcast(
  message: string,
  target: BroadcastTarget,
  restaurantId: string,
  nature: BroadcastNature = "promo"
): Promise<BroadcastResult> {
  const admin = createAdminClient();

  const allMembers = await resolveAudience(admin, restaurantId, target);
  if (allMembers.length === 0) return { targeted: 0, sent: 0, skipped: 0 };

  // ADR 0022 + 0039 — le consentement marketing conditionne les PROMOS, pas
  // les informations de service : celles-ci exécutent le programme auquel le
  // membre a adhéré (art. 6.1.b), on ne peut pas les lui refuser faute d'un
  // opt-in publicitaire. À l'inscription comme dans /compte, push et WhatsApp
  // restent couplés en un seul opt-in « marketing ».
  const members =
    nature === "service"
      ? allMembers
      : await getConsentingUserIds(allMembers.map((x) => x.id), "marketing_push", admin).then((ok) =>
          allMembers.filter((m) => ok.has(m.id))
        );

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  let sent = 0;
  let skipped = 0;

  // Deux enveloppes distinctes (ADR 0039 §3) : une promo ne doit pas consommer
  // le droit d'informer, et une information de service ne doit pas ouvrir un
  // second quota de promos. Chacune reste à 2/semaine/membre.
  const journalType = nature === "service" ? "admin_service" : "admin_broadcast";

  for (const m of members) {
    const { count } = await admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", m.id)
      .eq("trigger_type", journalType)
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
    const ligne = {
      user_id: m.id,
      restaurant_id: restaurantId,
      channel,
      community_score_at_send: null,
      message_body: message,
    };
    const { error: journalError } = await admin
      .from("notification_log")
      .insert({ ...ligne, trigger_type: journalType });
    // Fail-open : tant que la migration du 21/08 n'est pas appliquée, la
    // contrainte CHECK refuse 'admin_service'. Le message est déjà parti — on
    // le journalise sous l'ancien type plutôt que de perdre la trace (et donc
    // le compteur anti-spam).
    if (journalError && journalType === "admin_service") {
      await admin.from("notification_log").insert({ ...ligne, trigger_type: "admin_broadcast" });
    }
    sent++;
  }

  return { targeted: members.length, sent, skipped };
}
