import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { buildMessage, sendPush, sendWhatsApp, logNotification, type TriggerType, type Channel } from "@/lib/notifications";

const SCORE_THRESHOLDS = [
  { score: 1000,  label: "Frites Medium" },
  { score: 3000,  label: "Churros 12 pcs" },
  { score: 6000,  label: "Finest burger" },
  { score: 10000, label: "4 Tenders Menu" },
];

const INACTIVE_DAYS     = 3;
const APPROACHING_RATIO = 0.90;
const SPAM_HOURS        = 48;
const MAX_PER_WEEK      = 3;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const admin = createAdminClient();
  const restaurantId = process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "molenbeek";
  const now = new Date();

  const { data: members } = await admin
    .from("profiles")
    .select("id, phone, last_notified_at, team_id, teams!inner(name, flag_emoji, is_active, round_reached, round_advanced_at)")
    .eq("restaurant_id", restaurantId)
    .not("team_id", "is", null);

  if (!members?.length) return NextResponse.json({ sent: 0, evaluated: 0 });

  const { data: scores } = await admin
    .from("community_scores")
    .select("team_id, score")
    .eq("restaurant_id", restaurantId);

  const scoreMap = new Map<string, number>((scores ?? []).map(s => [s.team_id, Number(s.score)]));

  let sent = 0;

  for (const member of members) {
    const team = (member as any).teams;
    if (!team?.is_active) continue;

    const teamScore = scoreMap.get(member.team_id!) ?? 0;

    // Anti-spam : 48h depuis dernière notification
    if (member.last_notified_at) {
      const hours = (now.getTime() - new Date(member.last_notified_at).getTime()) / 3_600_000;
      if (hours < SPAM_HOURS) continue;
    }

    // Anti-spam : max 3/semaine
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const { count: weeklyCount } = await admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", member.id)
      .gte("sent_at", weekAgo);
    if ((weeklyCount ?? 0) >= MAX_PER_WEEK) continue;

    // Skip si commande validée dans les 6h
    const sixHoursAgo = new Date(now.getTime() - 6 * 3_600_000).toISOString();
    const { count: recentOrders } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", member.id)
      .eq("status", "validated")
      .gte("submitted_at", sixHoursAgo);
    if ((recentOrders ?? 0) > 0) continue;

    let trigger: TriggerType | null = null;
    let message: string | null = null;

    // 1. Avancement d'équipe (haute priorité) — round_advanced_at dans les 24h
    if (team.round_advanced_at) {
      const hours = (now.getTime() - new Date(team.round_advanced_at).getTime()) / 3_600_000;
      if (hours <= 24) {
        trigger = "advancement";
        message = buildMessage("advancement", team.name, team.flag_emoji, { round: team.round_reached });
      }
    }

    // 2. Palier franchi (haute priorité)
    if (!trigger) {
      const reachedThreshold = SCORE_THRESHOLDS.filter(t => teamScore >= t.score).pop();
      if (reachedThreshold) {
        const { count: prevUpgrade } = await admin
          .from("notification_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", member.id)
          .eq("trigger_type", "tier_upgrade")
          .gte("community_score_at_send", reachedThreshold.score);
        if ((prevUpgrade ?? 0) === 0) {
          trigger = "tier_upgrade";
          message = buildMessage("tier_upgrade", team.name, team.flag_emoji, { newReward: reachedThreshold.label });
        }
      }
    }

    // 3. Palier approchant (priorité moyenne)
    if (!trigger) {
      const nextThreshold = SCORE_THRESHOLDS.find(t => t.score > teamScore);
      if (nextThreshold && teamScore >= nextThreshold.score * APPROACHING_RATIO) {
        trigger = "tier_approaching";
        message = buildMessage("tier_approaching", team.name, team.flag_emoji, {
          nextReward: nextThreshold.label,
          ptsNeeded: Math.ceil(nextThreshold.score - teamScore),
        });
      }
    }

    // 4. Membre inactif (priorité moyenne)
    if (!trigger) {
      const inactiveSince = new Date(now.getTime() - INACTIVE_DAYS * 86_400_000).toISOString();
      const { count: recentValidated } = await admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", member.id)
        .eq("status", "validated")
        .gte("submitted_at", inactiveSince);
      if ((recentValidated ?? 0) === 0) {
        trigger = "member_inactive";
        message = buildMessage("member_inactive", team.name, team.flag_emoji);
      }
    }

    if (!trigger || !message) continue;

    let channel: Channel = "in_app";
    const pushed = await sendPush(member.id, restaurantId, message);
    if (pushed) {
      channel = "push";
    } else if ((member as any).phone) {
      const waSent = await sendWhatsApp((member as any).phone, message);
      if (waSent) channel = "whatsapp";
    }
    await logNotification(member.id, restaurantId, trigger, channel, message, teamScore);
    sent++;
  }

  return NextResponse.json({ sent, evaluated: members.length });
}
