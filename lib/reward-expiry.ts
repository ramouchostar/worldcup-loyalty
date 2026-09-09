import { createAdminClient } from "./supabase";

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
// La fenêtre part de `created_at` (la colonne réelle ; l'`earned_at` de
// l'ADR 0006 n'a jamais été créé sous ce nom).

export const REWARD_CLAIM_WINDOW_HOURS = 48;

const HOUR_MS = 3_600_000;

/** Instant où le cadeau cesse d'être récupérable. Pur. */
export function claimDeadline(createdAt: string | Date): Date {
  const from = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return new Date(from.getTime() + REWARD_CLAIM_WINDOW_HOURS * HOUR_MS);
}

/**
 * La fenêtre est-elle passée ? Pur, `now` injecté — c'est ce prédicat que
 * partagent le cron (balayage) et la génération de coupon (garde à la
 * demande), pour qu'ils ne puissent pas dériver l'un de l'autre.
 *
 * Une date illisible renvoie `false` : on ne fait pas expirer un cadeau sur
 * une donnée qu'on ne sait pas lire.
 */
export function isClaimWindowOver(createdAt: string | Date, now: Date = new Date()): boolean {
  const deadline = claimDeadline(createdAt).getTime();
  if (Number.isNaN(deadline)) return false;
  return deadline <= now.getTime();
}

export type ExpiryResult = { expired: number };

/**
 * Balayage horaire : tout cadeau resté `available` au-delà de sa fenêtre
 * passe `expired`, ce qui libère le slot un-seul-actif du membre.
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
  const cutoff = new Date(now.getTime() - REWARD_CLAIM_WINDOW_HOURS * HOUR_MS).toISOString();

  const { data, error } = await admin
    .from("pending_rewards")
    .update({ status: "expired" })
    .eq("status", "available")
    .lt("created_at", cutoff)
    .select("id");

  if (error) throw new Error(`pending_rewards(expire): ${error.message}`);
  return { expired: (data ?? []).length };
}
