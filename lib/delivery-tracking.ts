// Le suivi de délivrance marche-t-il ? (ADR 0063 §6)
// Le secret configuré ne prouve rien : du 2026-10-02 au 2026-11-09, la console
// affichait « Webhook signé » en vert alors qu'aucun accusé n'arrivait plus.
// Seule preuve : des accusés reçus après les derniers envois.

export const SILENT_AFTER_HOURS = 48;
// Resend accuse en quelques secondes : un e-mail parti depuis plus d'une heure
// sans aucun accusé derrière lui compte comme « en attente d'accusé ».
export const SETTLE_MINUTES = 60;
// Assez d'envois pour qu'un silence ne soit pas un hasard.
export const MIN_UNACKED = 3;

export type DeliveryTracking =
  | { state: "off" }
  | { state: "ok"; lastEventAt: string }
  | { state: "waiting"; lastEventAt: string | null }
  | { state: "silent"; lastEventAt: string | null; unacked: number };

export function deliveryTracking(input: {
  hasSecret: boolean;
  lastEventAt: string | null; // dernier délivré, rebond ou plainte reçu
  unackedSinceEvent: number; // e-mails partis après lui, depuis plus de SETTLE_MINUTES
  now?: Date;
}): DeliveryTracking {
  const { hasSecret, lastEventAt, unackedSinceEvent } = input;
  if (!hasSecret) return { state: "off" };
  const now = (input.now ?? new Date()).getTime();
  const ageHours = lastEventAt ? (now - new Date(lastEventAt).getTime()) / 3_600_000 : Infinity;
  if (unackedSinceEvent >= MIN_UNACKED && ageHours > SILENT_AFTER_HOURS) {
    return { state: "silent", lastEventAt, unacked: unackedSinceEvent };
  }
  return lastEventAt ? { state: "ok", lastEventAt } : { state: "waiting", lastEventAt };
}
