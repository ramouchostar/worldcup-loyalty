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
  const now = new Date();

  // ADR 0015 §1 — un seul déploiement sert tous les établissements : le cron
  // évalue chaque restaurant actif, plus seulement celui de l'environnement.
  const { data: restaurantsRaw } = await admin
    .from("restaurants")
    .select("id, name")
    .eq("status", "active");
  const restaurants = (restaurantsRaw ?? []) as { id: string; name: string }[];

  let sent = 0;
  let evaluated = 0;

  for (const restaurant of restaurants) {
  const restaurantId = restaurant.id;

  // ADR 0015 — l'appartenance à un établissement + une équipe vit désormais
  // dans memberships, pas dans profiles (colonne conservée mais plus lue).
  const { data: membershipsRaw } = await admin
    .from("memberships")
    .select("user_id, team_id, profiles!inner(phone, last_notified_at), teams!inner(name, flag_emoji, is_active)")
    .eq("restaurant_id", restaurantId)
    .not("team_id", "is", null);

  const members = (membershipsRaw ?? []).map((m: any) => ({
    id: m.user_id,
    phone: m.profiles.phone,
    last_notified_at: m.profiles.last_notified_at,
    team_id: m.team_id,
    teams: m.teams,
  }));

  if (!members?.length) continue;
  evaluated += members.length;

  const { data: scores } = await admin
    .from("community_scores")
    .select("team_id, score")
    .eq("restaurant_id", restaurantId);

  const scoreMap = new Map<string, number>((scores ?? []).map(s => [s.team_id, Number(s.score)]));

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
      .neq("trigger_type", "admin_broadcast") // broadcasts = quota séparé (T8c)
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

    // 1. Palier franchi (haute priorité)
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
          message = buildMessage("tier_upgrade", team.name, team.flag_emoji, restaurant.name, { newReward: reachedThreshold.label });
        }
      }
    }

    // 3. Palier approchant (priorité moyenne)
    if (!trigger) {
      const nextThreshold = SCORE_THRESHOLDS.find(t => t.score > teamScore);
      if (nextThreshold && teamScore >= nextThreshold.score * APPROACHING_RATIO) {
        trigger = "tier_approaching";
        message = buildMessage("tier_approaching", team.name, team.flag_emoji, restaurant.name, {
          nextReward: nextThreshold.label,
          ptsNeeded: Math.ceil(nextThreshold.score - teamScore),
        });
      }
    }

    // 4. Membre inactif + communauté progressée (priorité moyenne)
    // ADR 0009 : déclenche seulement si +500 pts absolus depuis la dernière notification
    if (!trigger) {
      const inactiveSince = new Date(now.getTime() - INACTIVE_DAYS * 86_400_000).toISOString();
      const { count: recentValidated } = await admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", member.id)
        .eq("status", "validated")
        .gte("submitted_at", inactiveSince);

      if ((recentValidated ?? 0) === 0) {
        const { data: lastLog } = await admin
          .from("notification_log")
          .select("community_score_at_send")
          .eq("user_id", member.id)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const scoreAtLastNotif = lastLog ? Number(lastLog.community_score_at_send) : 0;
        if (teamScore - scoreAtLastNotif >= 500) {
          trigger = "member_inactive";
          message = buildMessage("member_inactive", team.name, team.flag_emoji, restaurant.name);
        }
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
  } // fin boucle restaurants

  return NextResponse.json({ sent, evaluated, restaurants: restaurants.length });
}
