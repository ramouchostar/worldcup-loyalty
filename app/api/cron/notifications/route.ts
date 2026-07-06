import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { buildMessage, sendPush, sendWhatsApp, logNotification, type TriggerType, type Channel } from "@/lib/notifications";
import { loadRewardGrid, type GridTier } from "@/lib/rewards";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getBudgetStatus } from "@/lib/budget";
import { coverageSatisfied, type TeamCoverage } from "@/lib/reward-sizing";

// Paliers communautaires : catalogue de l'établissement (ADR 0013), fallback
// grille héritée — même source de vérité que la résolution des récompenses.
// Un palier n'est annoncé que s'il est réellement délivrable : double verrou,
// plafond budget (ADR 0012) et couverture d'équipe (ADR 0017).

// Palier le plus élevé atteint au score ET couvert pour cette équipe
function reachedCoveredTier(tiers: GridTier[], score: number, coverage: TeamCoverage): GridTier | null {
  let best: GridTier | null = null;
  for (const t of tiers) {
    if (score < t.min) break;
    if (coverageSatisfied(coverage, t.cost)) best = t;
  }
  return best;
}

// Prochain palier au-dessus du score, couvert pour cette équipe
function nextCoveredTier(tiers: GridTier[], score: number, coverage: TeamCoverage): GridTier | null {
  return tiers.find((t) => t.min > score && coverageSatisfied(coverage, t.cost)) ?? null;
}

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

  // État du programme pour l'établissement : grille catalogue + double verrou
  // + plafond budget — les notifications de palier ne promettent que ce que
  // la résolution des récompenses délivrerait vraiment.
  const [grid, restaurantUnlocked, budget, { data: scores }] = await Promise.all([
    loadRewardGrid(restaurantId),
    isRestaurantThresholdUnlocked(restaurantId),
    getBudgetStatus(restaurantId),
    admin
      .from("community_scores")
      .select("team_id, score, total_spent, member_count")
      .eq("restaurant_id", restaurantId),
  ]);
  // Fallback hérité géré par loadRewardGrid (resto legacy uniquement) —
  // grille vide = aucun palier à promettre en notification.
  const communityTiers = grid.community;
  const bonusDeliverable = restaurantUnlocked && budget.communityBonusActive;

  type ScoreRow = { team_id: string; score: number; total_spent: number; member_count: number };
  const scoreMap = new Map<string, ScoreRow>(
    ((scores ?? []) as ScoreRow[]).map((s) => [s.team_id, s])
  );

  for (const member of members) {
    const team = (member as any).teams;
    if (!team?.is_active) continue;

    const scoreRow = scoreMap.get(member.team_id!);
    const teamScore = Number(scoreRow?.score ?? 0);
    // Couverture d'équipe (ADR 0017) — mêmes données que createPendingReward
    const coverage: TeamCoverage = {
      memberCount: scoreRow?.member_count ?? 0,
      teamTotalSpent: Number(scoreRow?.total_spent ?? 0),
      budgetPct: budget.budgetPct,
    };

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

    // 1. Palier franchi (haute priorité) — uniquement si le bonus serait
    // réellement délivré (double verrou + budget + couverture ADR 0017)
    if (!trigger && bonusDeliverable) {
      const reachedTier = reachedCoveredTier(communityTiers, teamScore, coverage);
      if (reachedTier) {
        const { count: prevUpgrade } = await admin
          .from("notification_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", member.id)
          .eq("trigger_type", "tier_upgrade")
          .gte("community_score_at_send", reachedTier.min);
        if ((prevUpgrade ?? 0) === 0) {
          trigger = "tier_upgrade";
          message = buildMessage("tier_upgrade", team.name, team.flag_emoji, restaurant.name, { newReward: reachedTier.item });
        }
      }
    }

    // 3. Palier approchant (priorité moyenne) — même règle de délivrabilité
    if (!trigger && bonusDeliverable) {
      const nextTier = nextCoveredTier(communityTiers, teamScore, coverage);
      if (nextTier && teamScore >= nextTier.min * APPROACHING_RATIO) {
        trigger = "tier_approaching";
        message = buildMessage("tier_approaching", team.name, team.flag_emoji, restaurant.name, {
          nextReward: nextTier.item,
          ptsNeeded: Math.ceil(nextTier.min - teamScore),
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
