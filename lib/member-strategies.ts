import { createAdminClient } from "./supabase";
import { sendPush, sendWhatsApp, logNotification, type Channel, type TriggerType } from "./notifications";
import { loadRewardGrid, resolveSoloReward, type GridTier } from "./rewards";
import { getMenuItems } from "./menu";
import { getAverageBasket } from "./avg-basket";
import { getBudgetStatus, incrementRewardsCost } from "./budget";
import { birthdayGiftCap, pickGenerousGift, type GiftCandidate } from "./reward-sizing";
import { getActionLinks } from "./social-actions";
import type { MicroRewardType } from "@/types";

// ADR 0024 — Stratégies membres : notifications personnalisées, jouées par
// le cron quotidien pour TOUS les membres de l'établissement (avec ou sans
// équipe), sous l'enveloppe anti-spam d'ADR 0009 :
//
// 1. birthday               — cadeau d'anniversaire calibré sur la dépense
//                              cumulée du membre : la reconnaissance grandit
//                              avec la fidélité.
// 2. winback                — le membre dont la fréquence décroche (silence
//                              ≥ 2× son rythme habituel) reçoit un rappel
//                              personnalisé.
// 3. tier_nudge              — le membre dont le panier habituel est juste
//                              sous un palier solo apprend ce qu'il
//                              gagnerait pour quelques euros de plus. Zéro
//                              remise : la valeur perçue du cadeau fait le
//                              travail, le coût est déjà plafonné par l'ADR
//                              0017.
// 4. action_postpone_reminder — une mission de la Carte Actions (dashboard)
//                              reportée par le membre et toujours pas
//                              soumise 7 jours après.
//
// Les euros cités dans les messages sont les dépenses PROPRES du membre
// (panier habituel, seuils de palier solo) — autorisés côté membre, comme
// « Mes stats » (ADR 0007).

// Bord de palier : l'effort demandé doit rester ≤ 20 % du seuil visé —
// au-delà, ce n'est plus un arrondi mais un changement de comportement.
export const NUDGE_MAX_GAP_RATIO = 0.2;
export const NUDGE_MIN_ORDERS = 2;
export const NUDGE_COOLDOWN_DAYS = 30;

// Décrochage : silence ≥ 2× l'intervalle médian du membre, et jamais moins
// de 14 jours (un rythme hebdo ne « décroche » pas au bout de 10 jours).
export const WINBACK_GAP_FACTOR = 2;
export const WINBACK_MIN_DAYS = 14;
export const WINBACK_MIN_ORDERS = 3;
export const WINBACK_COOLDOWN_DAYS = 30;

// Un seul anniversaire par an (300 jours couvrent les décalages de cron).
export const BIRTHDAY_DEDUPE_DAYS = 300;

// Mission de la Carte Actions reportée ("plus tard") et toujours pas
// soumise une semaine après — un seul rappel (cooldown long, pas un nudge
// répété tant que le membre ne reporte pas à nouveau).
export const ACTION_REMINDER_DELAY_DAYS = 7;
export const ACTION_REMINDER_COOLDOWN_DAYS = 90;

// ─── Décisions pures ─────────────────────────────────────────────────────────

export type TierNudge = { target: GridTier; gap: number };

// Prochain palier solo au-dessus du panier habituel du membre, si l'écart
// est un simple arrondi (≤ 20 % du seuil) et que le cadeau y est réellement
// meilleur que celui de son panier actuel.
export function findTierNudge(memberAvg: number, soloTiers: GridTier[]): TierNudge | null {
  if (memberAvg <= 0) return null;
  const target = soloTiers.find((t) => t.min > memberAvg && t.item);
  if (!target) return null;
  const current = soloTiers.filter((t) => t.min <= memberAvg).pop();
  if (current && current.item === target.item) return null;
  const gap = target.min - memberAvg;
  return gap <= target.min * NUDGE_MAX_GAP_RATIO ? { target, gap } : null;
}

export type LapsedStatus = { daysSince: number; medianGapDays: number };

// Le membre a-t-il décroché de SON rythme ? Intervalle médian entre ses
// commandes vs silence actuel.
export function lapsedStatus(orderTimesISO: string[], nowMs: number): LapsedStatus | null {
  if (orderTimesISO.length < WINBACK_MIN_ORDERS) return null;
  const times = orderTimesISO.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 86_400_000);
  gaps.sort((a, b) => a - b);
  const medianGapDays = gaps[Math.floor(gaps.length / 2)];
  const daysSince = (nowMs - times[times.length - 1]) / 86_400_000;
  const threshold = Math.max(WINBACK_MIN_DAYS, WINBACK_GAP_FACTOR * medianGapDays);
  if (daysSince < threshold) return null;
  return { daysSince: Math.floor(daysSince), medianGapDays };
}

// Anniversaire = même mois-jour (les 29/02 sont fêtés les années bissextiles).
export function isBirthday(birthDate: string | null, todayISO: string): boolean {
  if (!birthDate) return false;
  return birthDate.slice(5, 10) === todayISO.slice(5, 10);
}

// ─── Évaluation quotidienne ──────────────────────────────────────────────────

type MemberRow = {
  user_id: string;
  profiles: { display_name: string | null; phone: string | null; last_notified_at: string | null; birth_date: string | null };
};

type Admin = ReturnType<typeof createAdminClient>;

async function countRecentByTrigger(
  admin: Admin,
  userId: string,
  trigger: TriggerType,
  sinceDays: number,
  now: Date
): Promise<number> {
  const since = new Date(now.getTime() - sinceDays * 86_400_000).toISOString();
  const { count } = await admin
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("trigger_type", trigger)
    .gte("sent_at", since);
  return count ?? 0;
}

export async function runMemberStrategies(
  restaurantId: string,
  restaurantName: string,
  now: Date
): Promise<{ sent: number; evaluated: number }> {
  const admin = createAdminClient();
  const todayISO = now.toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });

  // TOUS les membres de l'établissement — l'équipe est optionnelle (ADR 0018).
  const { data: membersRaw } = await admin
    .from("memberships")
    .select("user_id, profiles!inner(display_name, phone, last_notified_at, birth_date)")
    .eq("restaurant_id", restaurantId);
  const members = ((membersRaw ?? []) as unknown as MemberRow[]).map((m) => ({
    id: m.user_id,
    ...m.profiles,
  }));
  if (members.length === 0) return { sent: 0, evaluated: 0 };

  const [grid, avgBasket, budget, menuItems, { data: restaurantSocial }] = await Promise.all([
    loadRewardGrid(restaurantId),
    getAverageBasket(restaurantId),
    getBudgetStatus(restaurantId),
    getMenuItems(restaurantId),
    admin
      .from("restaurants")
      .select("google_maps_url, instagram_url, tiktok_url, facebook_url")
      .eq("id", restaurantId)
      .single(),
  ]);
  // Types de mission réellement actionnables pour cet établissement (lien
  // configuré) — même résolution que la Carte Actions côté membre.
  const actionLinks = getActionLinks(
    restaurantSocial ?? { google_maps_url: null, instagram_url: null, tiktok_url: null, facebook_url: null },
    restaurantId
  );
  const giftCandidates: GiftCandidate[] = menuItems
    .filter((i) => i.is_active && i.reward_eligible)
    .map((i) => ({ id: i.id, name: i.name, menu_price: Number(i.menu_price), cost_price: Number(i.cost_price) }));

  let sent = 0;

  for (const member of members) {
    // Enveloppe anti-spam ADR 0009 : 48h mini, 3/semaine, silence 6h
    // post-commande — partagée avec les triggers communautaires.
    if (member.last_notified_at) {
      const hours = (now.getTime() - new Date(member.last_notified_at).getTime()) / 3_600_000;
      if (hours < 48) continue;
    }
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const { count: weeklyCount } = await admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", member.id)
      .neq("trigger_type", "admin_broadcast")
      .gte("sent_at", weekAgo);
    if ((weeklyCount ?? 0) >= 3) continue;

    const { data: ordersRaw } = await admin
      .from("orders")
      .select("amount, submitted_at")
      .eq("user_id", member.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .order("submitted_at", { ascending: true })
      .limit(200);
    const orders = (ordersRaw ?? []) as { amount: number; submitted_at: string }[];
    const lastOrderMs = orders.length > 0 ? new Date(orders[orders.length - 1].submitted_at).getTime() : 0;
    if (lastOrderMs > now.getTime() - 6 * 3_600_000) continue;

    const totalSpent = orders.reduce((s, o) => s + Number(o.amount), 0);
    const memberAvg = orders.length > 0 ? totalSpent / orders.length : 0;
    const firstName = member.display_name?.trim().split(/\s+/)[0] ?? null;

    let trigger: TriggerType | null = null;
    let message: string | null = null;

    // 1. Anniversaire (prioritaire — ça n'arrive qu'un jour par an)
    if (isBirthday(member.birth_date, todayISO)) {
      const already = await countRecentByTrigger(admin, member.id, "birthday", BIRTHDAY_DEDUPE_DAYS, now);
      if (already === 0) {
        // Cadeau calibré sur la fidélité (ADR 0024) — seulement si le budget
        // mensuel n'est pas épuisé (ADR 0012, même règle que les couches 2/3).
        let giftName: string | null = null;
        if (budget.communityBonusActive) {
          const gift = pickGenerousGift(giftCandidates, birthdayGiftCap(avgBasket, totalSpent, budget.budgetPct));
          if (gift) {
            const { error } = await admin.from("pending_rewards").insert({
              user_id: member.id,
              restaurant_id: restaurantId,
              order_id: null,
              solo_item: gift.name,
              solo_cost: gift.cost_price,
              status: "available",
              source: "birthday",
            });
            // 23505 = une récompense est déjà active (ADR 0011) → simple vœu.
            if (!error) {
              giftName = gift.name;
              await incrementRewardsCost(restaurantId, gift.cost_price);
            }
          }
        }
        trigger = "birthday";
        message = giftName
          ? `🎂 Joyeux anniversaire${firstName ? ` ${firstName}` : ""} ! ${restaurantName} t'offre ${giftName} — ton cadeau t'attend au comptoir, tu as 48h pour en profiter.`
          : `🎂 Joyeux anniversaire${firstName ? ` ${firstName}` : ""} ! Toute l'équipe de ${restaurantName} te souhaite une belle journée — passe nous voir pour la fêter.`;
      }
    }

    // 2. Réactivation — le membre a décroché de son propre rythme
    if (!trigger) {
      const lapsed = lapsedStatus(orders.map((o) => o.submitted_at), now.getTime());
      if (lapsed) {
        const recent = await countRecentByTrigger(admin, member.id, "winback", WINBACK_COOLDOWN_DAYS, now);
        if (recent === 0) {
          const usual = resolveSoloReward(grid, memberAvg);
          trigger = "winback";
          message = usual.item
            ? `👋 Ça fait ${lapsed.daysSince} jours qu'on ne t'a pas vu chez ${restaurantName} ! Ta commande habituelle te donne droit à « ${usual.item} » — il t'attend.`
            : `👋 Ça fait ${lapsed.daysSince} jours qu'on ne t'a pas vu chez ${restaurantName} ! Reviens vite — ton prochain cadeau t'attend.`;
        }
      }
    }

    // 3. Nudge de palier — quelques euros de plus, un cadeau nettement mieux
    if (!trigger && orders.length >= NUDGE_MIN_ORDERS) {
      const nudge = findTierNudge(memberAvg, grid.solo);
      if (nudge) {
        const recent = await countRecentByTrigger(admin, member.id, "tier_nudge", NUDGE_COOLDOWN_DAYS, now);
        if (recent === 0) {
          trigger = "tier_nudge";
          // ADR 0028 — zéro euro côté membre : on garde l'incitation (« commande
          // un peu plus → meilleur cadeau ») sans jamais chiffrer en euros.
          message = `🎁 Le savais-tu ? En commandant un peu plus chez ${restaurantName}, ton prochain cadeau passe à « ${nudge.target.item} » — tu y es presque !`;
        }
      }
    }

    // 4. Rappel de mission Carte Actions reportée — le membre a cliqué
    // « plus tard » et, une semaine après, n'a toujours rien soumis.
    if (!trigger) {
      const [{ data: postponesRaw }, { data: claimsRaw }] = await Promise.all([
        admin
          .from("micro_reward_postpones")
          .select("reward_type, postponed_at")
          .eq("user_id", member.id)
          .eq("restaurant_id", restaurantId),
        admin
          .from("micro_reward_claims")
          .select("reward_type")
          .eq("user_id", member.id),
      ]);
      const claimedTypes = new Set((claimsRaw ?? []).map((c) => c.reward_type as string));
      const due = (postponesRaw ?? []).find((p) => {
        const type = p.reward_type as MicroRewardType;
        if (claimedTypes.has(type) || !actionLinks[type]) return false;
        const daysSince = (now.getTime() - new Date(p.postponed_at).getTime()) / 86_400_000;
        return daysSince >= ACTION_REMINDER_DELAY_DAYS;
      });
      if (due) {
        const recent = await countRecentByTrigger(admin, member.id, "action_postpone_reminder", ACTION_REMINDER_COOLDOWN_DAYS, now);
        if (recent === 0) {
          trigger = "action_postpone_reminder";
          message = `⭐ Tu avais prévu de gagner un jeton chez ${restaurantName} — l'action t'attend toujours, ça ne prend qu'une minute.`;
        }
      }
    }

    if (!trigger || !message) continue;

    let channel: Channel = "in_app";
    const pushed = await sendPush(member.id, restaurantId, message);
    if (pushed) channel = "push";
    else if (member.phone) {
      const wa = await sendWhatsApp(member.phone, message);
      if (wa) channel = "whatsapp";
    }
    await logNotification(member.id, restaurantId, trigger, channel, message, null);
    sent++;
  }

  return { sent, evaluated: members.length };
}
