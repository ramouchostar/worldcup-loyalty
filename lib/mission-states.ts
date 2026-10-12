// ============================================================
// Réserver un prestataire (ADR 0084 §6) — les états d'une mission.
//
//   brief → envoye → devis → accepte → date_bloquee → production → livre
//        → (retouche → livre)×2 → valide → verse
//   branches : annule · litige · suspendu (paiement échoué)
//
// Une seule table de transitions : qui peut faire passer de quel état à quel
// état. Toute écriture d'état passe par `canTransition` (jamais de SET status
// libre), et chaque passage devient une ligne de `mission_events` — la trace.
//
// Fonctions PURES : l'instant « maintenant » est injecté.
// ============================================================

export const MISSION_STATUSES = [
  "brief", // brouillon du restaurateur, non verrouillé
  "envoye", // brief verrouillé, envoyé au prestataire
  "devis", // le prestataire a chiffré
  "accepte", // devis accepté, acompte payé
  "date_bloquee", // date dans les deux calendriers, rappels programmés
  "production", // jour J / travail en cours
  "livre", // livraison déposée
  "retouche", // le restaurateur a demandé un tour de retours
  "valide", // validé (par le restaurateur ou automatiquement)
  "verse", // prestataire payé — terminal
  "annule", // terminal
  "litige", // la plateforme arbitre
  "suspendu", // prélèvement échoué, mission gelée
] as const;

export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type Actor = "restaurant" | "provider" | "system" | "platform";

export const TERMINAL_STATUSES: readonly MissionStatus[] = ["verse", "annule"];

/** Nombre de tours de retours inclus (ADR 0084 §3, règle 8). */
export const MAX_RETOUCH_ROUNDS = 2;

type Rule = { to: MissionStatus; by: readonly Actor[] };

const ANYONE: readonly Actor[] = ["restaurant", "provider", "platform"];

const RULES: Record<MissionStatus, readonly Rule[]> = {
  brief: [
    { to: "envoye", by: ["restaurant"] },
    { to: "annule", by: ["restaurant", "platform"] },
  ],
  envoye: [
    { to: "devis", by: ["provider"] },
    // Le prestataire refuse, ou le restaurateur retire sa demande.
    { to: "annule", by: ["provider", "restaurant", "platform"] },
  ],
  devis: [
    { to: "accepte", by: ["restaurant"] },
    { to: "annule", by: ["restaurant", "platform", "system"] },
  ],
  accepte: [
    { to: "date_bloquee", by: ["system"] },
    { to: "suspendu", by: ["system"] },
    { to: "annule", by: ANYONE },
    { to: "litige", by: ANYONE },
  ],
  date_bloquee: [
    { to: "production", by: ["provider", "system"] },
    { to: "suspendu", by: ["system"] },
    { to: "annule", by: ANYONE },
    { to: "litige", by: ANYONE },
  ],
  production: [
    { to: "livre", by: ["provider"] },
    { to: "annule", by: ["platform"] },
    { to: "litige", by: ANYONE },
  ],
  livre: [
    { to: "retouche", by: ["restaurant"] },
    { to: "valide", by: ["restaurant", "system", "platform"] },
    { to: "litige", by: ANYONE },
  ],
  retouche: [
    { to: "livre", by: ["provider"] },
    { to: "litige", by: ANYONE },
  ],
  valide: [{ to: "verse", by: ["system", "platform"] }],
  verse: [],
  annule: [],
  litige: [
    // La plateforme tranche : verser, rembourser, ou faire refaire.
    { to: "verse", by: ["platform"] },
    { to: "annule", by: ["platform"] },
    { to: "retouche", by: ["platform"] },
  ],
  suspendu: [
    { to: "date_bloquee", by: ["system", "platform"] },
    { to: "annule", by: ["system", "platform"] },
  ],
};

export type TransitionContext = {
  /** Tours de retours déjà demandés (livre → retouche). */
  roundsUsed?: number;
};

export type TransitionVerdict = { ok: true } | { ok: false; reason: "unknown_status" | "terminal" | "not_allowed" | "actor_not_allowed" | "no_rounds_left" };

export function canTransition(from: MissionStatus, to: MissionStatus, by: Actor, ctx: TransitionContext = {}): TransitionVerdict {
  if (!(from in RULES) || !MISSION_STATUSES.includes(to)) return { ok: false, reason: "unknown_status" };
  if (TERMINAL_STATUSES.includes(from)) return { ok: false, reason: "terminal" };
  const rule = RULES[from].find((r) => r.to === to);
  if (!rule) return { ok: false, reason: "not_allowed" };
  if (!rule.by.includes(by)) return { ok: false, reason: "actor_not_allowed" };
  // Les tours de retours sont comptés : le 3ᵉ n'est plus un tour, c'est une demande de modification.
  if (from === "livre" && to === "retouche" && by === "restaurant" && (ctx.roundsUsed ?? 0) >= MAX_RETOUCH_ROUNDS) {
    return { ok: false, reason: "no_rounds_left" };
  }
  return { ok: true };
}

/** États que cet acteur peut atteindre depuis `from`. */
export function nextStatuses(from: MissionStatus, by: Actor, ctx: TransitionContext = {}): MissionStatus[] {
  return RULES[from].filter((r) => canTransition(from, r.to, by, ctx).ok).map((r) => r.to);
}

export function isTerminal(s: MissionStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

/** Retours restants pour le restaurateur. */
export function roundsLeft(roundsUsed: number): number {
  return Math.max(0, MAX_RETOUCH_ROUNDS - roundsUsed);
}

// ── Validation automatique ───────────────────────────────────

/** Silence du restaurateur avant validation automatique (ADR 0084 §6). */
export const AUTO_VALIDATE_DAYS = 7;
/** Les deux rappels précèdent toujours la validation automatique. */
export const AUTO_VALIDATE_REMINDER_DAYS = [3, 5] as const;

export type AutoValidation =
  | { action: "wait" }
  | { action: "remind"; reminder: 1 | 2 }
  | { action: "validate" };

/**
 * Que faire d'une livraison restée sans réponse ?
 * - rappel n° 1 à J+3, rappel n° 2 à J+5 (chacun envoyé une seule fois) ;
 * - validation automatique à J+7, SEULEMENT si les deux rappels sont partis :
 *   un rappel perdu ne se transforme jamais en validation silencieuse.
 */
export function autoValidation(deliveredAt: Date, now: Date, remindersSent: number): AutoValidation {
  const days = (now.getTime() - deliveredAt.getTime()) / 86_400_000;
  if (days >= AUTO_VALIDATE_DAYS && remindersSent >= 2) return { action: "validate" };
  if (remindersSent < 1 && days >= AUTO_VALIDATE_REMINDER_DAYS[0]) return { action: "remind", reminder: 1 };
  // Passé J+7 avec un rappel manquant, c'est ce rappel qui part (la validation vient au passage suivant).
  if (remindersSent < 2 && days >= AUTO_VALIDATE_REMINDER_DAYS[1]) return { action: "remind", reminder: 2 };
  return { action: "wait" };
}
