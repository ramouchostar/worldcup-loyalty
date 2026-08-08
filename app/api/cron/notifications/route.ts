import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { buildMessage, sendPush, sendWhatsApp, logNotification, type TriggerType, type Channel } from "@/lib/notifications";
import { loadRewardGrid, type GridTier } from "@/lib/rewards";
import { isRestaurantThresholdUnlocked } from "@/lib/thresholds";
import { getBudgetStatus } from "@/lib/budget";
import { coverageSatisfied, type TeamCoverage } from "@/lib/reward-sizing";
import { runMemberStrategies } from "@/lib/member-strategies";
import {
  wasEmailSentRecently,
  sendTierUnlockedEmail,
  sendPendingRequestsReminderEmail,
  sendOnboardingReminderEmail,
  sendRewardReadyEmail,
} from "@/lib/email";

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

// Rappel restaurateur "demandes clients en attente" (orders + micro_reward_claims
// combinés) — n'envoie que si ça vaut le coup de déranger.
const PENDING_REQUESTS_COUNT_THRESHOLD = 15;
const PENDING_REQUESTS_AGE_HOURS       = 48;
const PENDING_REQUESTS_EMAIL_COOLDOWN  = 20; // ~1x/jour tant que ça persiste

// Relance onboarding self-service inachevé (étape 2 ou 3)
const ONBOARDING_STUCK_HOURS   = 48;
const ONBOARDING_EMAIL_COOLDOWN = 48;

// Rappel cadeau prêt à récupérer avant expiration (ADR 0011 : 48h)
const REWARD_EXPIRY_HOURS           = 48;
const REWARD_READY_REMAINING_HOURS  = 12; // envoi quand il reste ≤ 12h
const REWARD_READY_EMAIL_COOLDOWN   = 48;

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
    .select("id, name, profiles!restaurants_owner_id_fkey(email)")
    .eq("status", "active");
  const restaurants = (restaurantsRaw ?? []).map((r: any) => ({
    id: r.id as string,
    name: r.name as string,
    ownerEmail: (r.profiles?.email as string | null | undefined) ?? null,
  }));

  let sent = 0;
  let evaluated = 0;

  for (const restaurant of restaurants) {
  const restaurantId = restaurant.id;

  // ADR 0024 — stratégies membres (anniversaire, réactivation, nudge de
  // palier), évaluées AVANT les triggers communautaires : l'anniversaire
  // n'arrive qu'un jour par an, il gagne le créneau anti-spam du jour.
  // Couvre tous les membres, avec ou sans équipe (ADR 0018).
  const memberStrategies = await runMemberStrategies(restaurantId, restaurant.name, now);
  sent += memberStrategies.sent;

  // ADR 0015 — l'appartenance à un établissement + une équipe vit désormais
  // dans memberships, pas dans profiles (colonne conservée mais plus lue).
  const { data: membershipsRaw } = await admin
    .from("memberships")
    .select("user_id, team_id, profiles!inner(email, display_name, phone, last_notified_at), teams!inner(name, flag_emoji, is_active)")
    .eq("restaurant_id", restaurantId)
    .not("team_id", "is", null);

  const members = (membershipsRaw ?? []).map((m: any) => ({
    id: m.user_id,
    email: m.profiles.email,
    display_name: m.profiles.display_name,
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
    let tierUnlockedReward: string | null = null;

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
          tierUnlockedReward = reachedTier.item;
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

    // Canal email en plus du push/WhatsApp (ADR 0009 inchangé, ajout emailing)
    if (trigger === "tier_upgrade" && tierUnlockedReward && (member as any).email) {
      const memberFirstName = (member as any).display_name?.trim().split(/\s+/)[0] || "toi";
      await sendTierUnlockedEmail(
        (member as any).email,
        member.id,
        memberFirstName,
        restaurantId,
        restaurant.name,
        team.name,
        team.flag_emoji,
        tierUnlockedReward
      );
    }
  }

  // ── Cadeau prêt à récupérer avant expiration (ADR 0011, 48h) ────────────
  const { data: readyRewardsRaw } = await admin
    .from("pending_rewards")
    .select("id, user_id, created_at, profiles!inner(email, display_name)")
    .eq("restaurant_id", restaurantId)
    .eq("status", "available");

  for (const reward of (readyRewardsRaw ?? []) as any[]) {
    const hoursSince = (now.getTime() - new Date(reward.created_at).getTime()) / 3_600_000;
    const hoursRemaining = REWARD_EXPIRY_HOURS - hoursSince;
    if (hoursRemaining <= 0 || hoursRemaining > REWARD_READY_REMAINING_HOURS) continue;
    if (!reward.profiles?.email) continue;

    const alreadySent = await wasEmailSentRecently(
      "member",
      reward.user_id,
      "reward_ready",
      REWARD_READY_EMAIL_COOLDOWN
    );
    if (alreadySent) continue;

    const rewardFirstName = reward.profiles.display_name?.trim().split(/\s+/)[0] || "toi";
    await sendRewardReadyEmail(
      reward.profiles.email,
      reward.user_id,
      rewardFirstName,
      restaurantId,
      restaurant.name,
      hoursRemaining
    );
  }

  // ── Rappel restaurateur : demandes clients en attente (orders + micro_reward_claims) ──
  if (restaurant.ownerEmail) {
    const [{ data: pendingOrders }, { data: pendingClaims }] = await Promise.all([
      admin
        .from("orders")
        .select("submitted_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending"),
      admin
        .from("micro_reward_claims")
        .select("claimed_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending"),
    ]);

    const pendingOrdersList = pendingOrders ?? [];
    const pendingClaimsList = pendingClaims ?? [];
    const totalPending = pendingOrdersList.length + pendingClaimsList.length;

    if (totalPending > 0) {
      const oldestTimestamps = [
        ...pendingOrdersList.map((o) => new Date(o.submitted_at).getTime()),
        ...pendingClaimsList.map((c) => new Date(c.claimed_at).getTime()),
      ];
      const oldestPendingHours = (now.getTime() - Math.min(...oldestTimestamps)) / 3_600_000;

      if (totalPending > PENDING_REQUESTS_COUNT_THRESHOLD || oldestPendingHours > PENDING_REQUESTS_AGE_HOURS) {
        const alreadySent = await wasEmailSentRecently(
          "restaurant",
          restaurantId,
          "pending_requests_reminder",
          PENDING_REQUESTS_EMAIL_COOLDOWN
        );
        if (!alreadySent) {
          await sendPendingRequestsReminderEmail(
            restaurant.ownerEmail,
            restaurant.name,
            restaurantId,
            totalPending,
            oldestPendingHours
          );
        }
      }
    }
  }
  } // fin boucle restaurants

  // ── Relance onboarding self-service inachevé (étape 2 ou 3, ADR 0019) ──
  const { data: pendingRestaurantsRaw } = await admin
    .from("restaurants")
    .select("id, name, created_at, profiles!restaurants_owner_id_fkey(email)")
    .eq("status", "pending");

  for (const r of (pendingRestaurantsRaw ?? []) as any[]) {
    const hoursSinceCreated = (now.getTime() - new Date(r.created_at).getTime()) / 3_600_000;
    if (hoursSinceCreated < ONBOARDING_STUCK_HOURS) continue;

    const ownerEmail = r.profiles?.email;
    if (!ownerEmail) continue;

    const [{ count: menuItemsCount }, { data: receiptConfig }] = await Promise.all([
      admin.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id),
      admin.from("restaurant_receipt_config").select("confirmed_at").eq("restaurant_id", r.id).maybeSingle(),
    ]);

    let stuckAtStep: 2 | 3 | null = null;
    if ((menuItemsCount ?? 0) === 0) {
      stuckAtStep = 2;
    } else if (!receiptConfig?.confirmed_at) {
      stuckAtStep = 3;
    }
    if (stuckAtStep === null) continue; // onboarding terminé, en attente de validation — pas une relance

    const alreadySent = await wasEmailSentRecently("restaurant", r.id, "onboarding_reminder", ONBOARDING_EMAIL_COOLDOWN);
    if (alreadySent) continue;

    await sendOnboardingReminderEmail(ownerEmail, r.name, r.id, stuckAtStep);
  }

  return NextResponse.json({ sent, evaluated, restaurants: restaurants.length });
}
