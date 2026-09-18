// ============================================================
// Quand un cadeau se récupère (ADR 0011, amendé le 2026-09-18).
//
// Pur, sans dépendance serveur : partagé par la génération du coupon, le
// balayage d'expiration (lib/reward-expiry.ts), les rappels, et les écrans
// membre (boutons « Récupérer », accueil, Mes cadeaux).
//
// La fenêtre part de `created_at` (la colonne réelle ; l'`earned_at` de
// l'ADR 0006 n'a jamais été créé sous ce nom).
// ============================================================

/** Durée pendant laquelle un cadeau ouvert reste récupérable (ADR 0011). */
export const REWARD_CLAIM_WINDOW_HOURS = 48;

/**
 * Terrain Houba, 2026-09-17 : des clients scannaient leur ticket et
 * réclamaient le cadeau dans la minute, au même comptoir — le cadeau payait
 * la commande qui venait d'avoir lieu au lieu d'en provoquer une nouvelle. Un
 * cadeau né d'un TICKET s'ouvre donc 4 h après ce ticket (choix du porteur :
 * un retour le soir même est une vraie nouvelle visite), puis reste
 * récupérable 48 h. Les cadeaux d'anniversaire et de la réserve ne suivent
 * pas une commande : ils s'ouvrent tout de suite.
 */
export const REWARD_UNLOCK_DELAY_HOURS = 4;

/**
 * Commande minimum pour récupérer un cadeau (ADR 0011). Longtemps consigne
 * orale du caissier ; affichée au membre depuis le 2026-09-18 — exception
 * écrite à la règle « aucun euro côté client » (ADR 0007 amendé) : c'est une
 * condition de retrait, pas un seuil de cadeau ni un chiffre d'affaires.
 */
export const REDEMPTION_MIN_ORDER_EUR = 10;

/**
 * Cadeau d'équipe (ADR 0061 §7) : offert une fois à chaque membre quand
 * l'équipe franchit un palier. Il tombe sans que le membre soit venu — il a
 * besoin d'une semaine pour passer, pas de 48 h.
 */
export const TEAM_GIFT_CLAIM_WINDOW_HOURS = 7 * 24;

export type RewardSource = "order" | "saver" | "birthday" | "catalog" | "team";

const HOUR_MS = 3_600_000;

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

function unlockDelayHours(source: RewardSource | string | null | undefined): number {
  // Une ligne sans source est un cadeau de ticket (valeur historique par défaut).
  // Un cadeau choisi au catalogue (ADR 0061) s'ouvre tout de suite : ses points
  // étaient déjà disponibles — ceux d'un ticket restent en attente 4 h.
  // Un cadeau d'équipe ne suit pas une commande du membre : ouvert tout de suite.
  return source === "saver" || source === "birthday" || source === "catalog" || source === "team"
    ? 0
    : REWARD_UNLOCK_DELAY_HOURS;
}

function claimWindowHours(source: RewardSource | string | null | undefined): number {
  return source === "team" ? TEAM_GIFT_CLAIM_WINDOW_HOURS : REWARD_CLAIM_WINDOW_HOURS;
}

/** Instant à partir duquel le coupon peut s'ouvrir. */
export function claimOpensAt(createdAt: string | Date, source: RewardSource | string | null | undefined): Date {
  return new Date(toDate(createdAt).getTime() + unlockDelayHours(source) * HOUR_MS);
}

/** Instant où le cadeau cesse d'être récupérable : 48 h après son ouverture (7 jours pour un cadeau d'équipe). */
export function claimDeadline(createdAt: string | Date, source: RewardSource | string | null | undefined): Date {
  return new Date(claimOpensAt(createdAt, source).getTime() + claimWindowHours(source) * HOUR_MS);
}

/**
 * Le coupon ne peut pas encore s'ouvrir (même visite que le ticket). Une date
 * illisible renvoie `false` : on ne bloque pas un cadeau sur une donnée qu'on
 * ne sait pas lire.
 */
export function isClaimNotYetOpen(
  createdAt: string | Date,
  source: RewardSource | string | null | undefined,
  now: Date = new Date()
): boolean {
  const opens = claimOpensAt(createdAt, source).getTime();
  if (Number.isNaN(opens)) return false;
  return now.getTime() < opens;
}

/**
 * La fenêtre est-elle passée ? Partagé par le balayage horaire et la
 * génération du coupon, pour qu'ils ne puissent pas dériver l'un de l'autre.
 * Une date illisible renvoie `false` : on ne fait pas expirer un cadeau sur
 * une donnée qu'on ne sait pas lire.
 */
export function isClaimWindowOver(
  createdAt: string | Date,
  source: RewardSource | string | null | undefined,
  now: Date = new Date()
): boolean {
  const deadline = claimDeadline(createdAt, source).getTime();
  if (Number.isNaN(deadline)) return false;
  return deadline <= now.getTime();
}

const BRUSSELS = "Europe/Brussels";

function brusselsDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: BRUSSELS });
}

/**
 * « à 18:10 », « demain à 02:30 » ou « le 21 sept. à 18:10 » — heure de
 * Bruxelles, comme les tickets.
 */
export function formatOpensAt(opensAt: Date, now: Date = new Date()): string {
  const time = opensAt.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", timeZone: BRUSSELS });
  const day = brusselsDay(opensAt);
  if (day === brusselsDay(now)) return `à ${time}`;
  if (day === brusselsDay(new Date(now.getTime() + 24 * HOUR_MS))) return `demain à ${time}`;
  const date = opensAt.toLocaleDateString("fr-BE", { day: "numeric", month: "short", timeZone: BRUSSELS });
  return `le ${date} à ${time}`;
}

/** La règle de retrait, dite au membre partout où un cadeau l'attend. */
export function redemptionRule(source: RewardSource | string | null | undefined): string {
  return unlockDelayHours(source) > 0
    ? `À récupérer lors de ta prochaine visite, avec une commande d'au moins ${REDEMPTION_MIN_ORDER_EUR} €.`
    : `À récupérer au comptoir, avec une commande d'au moins ${REDEMPTION_MIN_ORDER_EUR} €.`;
}
