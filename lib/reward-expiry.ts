import { createAdminClient } from "./supabase";
import { REWARD_CLAIM_WINDOW_HOURS, REWARD_UNLOCK_DELAY_HOURS, TEAM_GIFT_CLAIM_WINDOW_HOURS } from "./reward-window";

// ADR 0011 — la fenêtre de 48 h du cadeau, enfin tenue côté serveur.
//
// L'ADR 0011 écrivait : « Un job cron (toutes les heures) passe les
// récompenses expirées à status = 'expired' ». Il n'a jamais été construit —
// l'ADR 0021 §6 le constatait déjà (« le countdown est cosmétique »). Deux
// conséquences mesurées sur kraainem le 2026-09-09 :
//
//   1. Cinq cadeaux étaient `available` depuis 2 à 3 semaines, dont trois
//      anniversaires. L'index partiel un-seul-actif (ADR 0011) fait qu'un
//      membre dans cet état ne reçoit AUCUN cadeau à sa prochaine commande
//      validée : le piège se déclenche exactement sur le retour qu'on
//      cherche à provoquer.
//   2. `pending_rewards.status = 'expired'` n'existait dans aucune ligne,
//      donc tout dénominateur qui le compte valait zéro (lib/health-metrics).
//
// Les règles de temps (ouverture 4 h après un ticket, puis 48 h pour
// récupérer — ADR 0011 amendé le 2026-09-18) vivent dans lib/reward-window.ts,
// pur et partagé avec la génération du coupon et les écrans membre.

export { REWARD_CLAIM_WINDOW_HOURS };

const HOUR_MS = 3_600_000;
/** Rattrapage des remboursements : cadeaux payés en points expirés depuis au plus N jours. */
const REFUND_CATCH_UP_DAYS = 14;

export type ExpiryResult = { expired: number };

/**
 * Balayage horaire : tout cadeau resté `available` au-delà de sa fenêtre
 * passe `expired`, ce qui libère le slot un-seul-actif du membre.
 *
 * Deux échéances, miroir de lib/reward-window.ts :
 *   - cadeau de ticket (ou sans source, valeur historique) : ouvert 4 h après
 *     le ticket, puis 48 h ;
 *   - anniversaire, gros cadeau de la réserve et cadeau du catalogue (ADR
 *     0061) : ouverts tout de suite, 48 h — ces deux derniers rendent leurs
 *     points s'ils expirent (`refund_catalog_reward`).
 *
 * Ne touche QUE `available` :
 *   - `redeemed` est posé dès l'ouverture du coupon (compare-and-swap
 *     anti-double-coupon, `POST /api/redemption/generate`) — le membre est
 *     venu, ce n'est plus une expiration ;
 *   - `banked` est un choix délibéré du membre (ADR 0021), pas un oubli.
 *
 * Idempotent (le filtre `status = 'available'` est aussi la garde de course)
 * et rejouable : un rattrapage après une panne de cron efface simplement
 * tout le retard d'un coup.
 */
export async function expireStaleRewards(now: Date = new Date()): Promise<ExpiryResult> {
  const admin = createAdminClient();
  const ticketCutoff = new Date(
    now.getTime() - (REWARD_UNLOCK_DELAY_HOURS + REWARD_CLAIM_WINDOW_HOURS) * HOUR_MS
  ).toISOString();
  const otherCutoff = new Date(now.getTime() - REWARD_CLAIM_WINDOW_HOURS * HOUR_MS).toISOString();
  const teamCutoff = new Date(now.getTime() - TEAM_GIFT_CLAIM_WINDOW_HOURS * HOUR_MS).toISOString();

  const [tickets, others, team] = await Promise.all([
    admin
      .from("pending_rewards")
      .update({ status: "expired" })
      .eq("status", "available")
      .or("source.is.null,source.eq.order")
      .lt("created_at", ticketCutoff)
      .select("id"),
    admin
      .from("pending_rewards")
      .update({ status: "expired" })
      .eq("status", "available")
      .in("source", ["saver", "birthday", "catalog"])
      .lt("created_at", otherCutoff)
      .select("id, source"),
    // Cadeau d'équipe (ADR 0061 §7) : 7 jours, rien à rendre (offert).
    admin
      .from("pending_rewards")
      .update({ status: "expired" })
      .eq("status", "available")
      .eq("source", "team")
      .lt("created_at", teamCutoff)
      .select("id"),
  ]);

  for (const result of [tickets, others, team]) {
    if (result.error) throw new Error(`pending_rewards(expire): ${result.error.message}`);
  }

  // ADR 0061 — un cadeau payé avec des points et jamais récupéré REND ses
  // points (et son coût au budget) : le client ne perd rien à avoir oublié.
  // Idempotent côté SQL (un remboursement au plus) : on repasse donc sur
  // TOUS les cadeaux payés en points expirés récemment, pas seulement ceux
  // de ce passage — un échec d'appel, ou un cadeau clos par la génération du
  // coupon, est rattrapé à l'heure suivante.
  const refundSince = new Date(now.getTime() - REFUND_CATCH_UP_DAYS * 24 * HOUR_MS).toISOString();
  const { data: expiredPaid, error: paidError } = await admin
    .from("pending_rewards")
    .select("id")
    .eq("status", "expired")
    .in("source", ["catalog", "saver"])
    .gte("created_at", refundSince);
  if (paidError) console.error("[reward-expiry] cadeaux à rembourser illisibles:", paidError.message);
  for (const reward of (expiredPaid ?? []) as { id: string }[]) {
    const { error } = await admin.rpc("refund_catalog_reward", { p_reward_id: reward.id });
    if (error) console.error("[reward-expiry] remboursement impossible:", reward.id, error.message);
  }

  return { expired: (tickets.data ?? []).length + (others.data ?? []).length + (team.data ?? []).length };
}
