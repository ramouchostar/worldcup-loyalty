// ============================================================
// Réserver un prestataire (ADR 0084 §4) — annulation et dates liantes.
//
// La date de tournage LIE le restaurateur :
//
//   Délai avant la date   Restaurateur annule          Prestataire annule
//   Plus de 7 jours       remboursé                    remboursé
//   7 jours à 48 h        50 % retenus (au prestataire) remboursé + avertissement
//   Moins de 48 h / absent 100 % retenus               remboursé + pénalité
//
// Fonctions PURES : le délai est une entrée (heures), l'instant « maintenant »
// est injecté. Le barème est affiché et accepté avant le paiement.
// ============================================================

import { BPS } from "./mission-money";

/** Au-delà de 7 jours (168 h) : annulation gratuite. */
export const FREE_CANCEL_HOURS = 7 * 24;
/** En dessous de 48 h : tout est dû. De 48 h à 7 jours inclus : la moitié. */
export const LATE_CANCEL_HOURS = 48;

export type Canceller = "restaurant" | "provider";
export type CancelBand = "free" | "half" | "full";
export type ProviderSanction = "none" | "avertissement" | "penalite";

export function cancelBand(hoursBefore: number): CancelBand {
  if (hoursBefore > FREE_CANCEL_HOURS) return "free";
  if (hoursBefore >= LATE_CANCEL_HOURS) return "half";
  return "full";
}

const RESTAURANT_RATIO_BPS: Record<CancelBand, number> = { free: 0, half: 5_000, full: BPS };
const PROVIDER_SANCTION: Record<CancelBand, ProviderSanction> = { free: "none", half: "avertissement", full: "penalite" };

export type CancellationInput = {
  by: Canceller;
  /** Heures entre l'annulation et le début du tournage (négatif = déjà passé). */
  hoursBefore: number;
  /** Absent le jour J (restaurant fermé / prestataire introuvable) : toujours la bande « full ». */
  noShow?: boolean;
  paidCents: number;
  /** Part du prestataire sur la somme payée (87,5 % du devis). */
  providerCents: number;
};

export type CancellationOutcome = {
  band: CancelBand;
  /** Rendu au restaurateur. */
  refundCents: number;
  /** Retenu sur ce que le restaurateur a payé. */
  retainedCents: number;
  /** Versé au prestataire sur la somme retenue (sa part, au prorata). */
  providerPayoutCents: number;
  /** Gardé par Boosteats sur la somme retenue. */
  platformKeepsCents: number;
  providerSanction: ProviderSanction;
};

export function cancellationOutcome(i: CancellationInput): CancellationOutcome {
  if (!Number.isInteger(i.paidCents) || i.paidCents < 0) throw new Error("paidCents invalide");
  if (!Number.isInteger(i.providerCents) || i.providerCents < 0) throw new Error("providerCents invalide");
  const band = i.noShow ? "full" : cancelBand(i.hoursBefore);

  if (i.by === "provider") {
    // Le prestataire qui annule ne coûte jamais rien au restaurateur.
    return { band, refundCents: i.paidCents, retainedCents: 0, providerPayoutCents: 0, platformKeepsCents: 0, providerSanction: PROVIDER_SANCTION[band] };
  }

  const ratio = RESTAURANT_RATIO_BPS[band];
  const retainedCents = Math.round((i.paidCents * ratio) / BPS);
  const providerPayoutCents = Math.min(retainedCents, Math.round((i.providerCents * ratio) / BPS));
  return {
    band,
    refundCents: i.paidCents - retainedCents,
    retainedCents,
    providerPayoutCents,
    platformKeepsCents: retainedCents - providerPayoutCents,
    providerSanction: "none",
  };
}

// ── Heure de Bruxelles ───────────────────────────────────────

const BRUSSELS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Décalage de Bruxelles par rapport à l'UTC à l'instant `t` (ms), arrondi à la minute. */
function brusselsOffsetMs(t: number): number {
  const p: Record<string, number> = {};
  for (const part of BRUSSELS.formatToParts(new Date(t))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60_000) * 60_000;
}

/** Instant réel d'une date et heure murales de Bruxelles (« 2026-10-20 », « 09:30 »). */
export function brusselsInstant(dateISO: string, hhmm: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Deux passes : le décalage dépend de l'instant, qui dépend du décalage.
  const first = wall - brusselsOffsetMs(wall);
  return new Date(wall - brusselsOffsetMs(first));
}

/** Heures entre `now` et le début du tournage (négatif si passé). */
export function hoursBeforeShoot(dateISO: string, startHHMM: string, now: Date): number {
  return (brusselsInstant(dateISO, startHHMM).getTime() - now.getTime()) / 3_600_000;
}
