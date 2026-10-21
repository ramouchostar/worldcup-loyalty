// ============================================================
// Réserver un prestataire (ADR 0084 §2) — « Revenus » du prestataire : ce qui est à venir, retenu, à verser, versé.
//
// Le prestataire reçoit le prix de son devis moins la commission de Boosteats (87,5 % au départ, jamais écrit en dur ici : les
// montants sont ceux FIGÉS sur la mission). Il est payé après la validation de sa livraison (par le restaurateur, ou
// automatiquement au bout de 7 jours). Pendant le pilote, avant Stripe, Boosteats verse à la main. Fonctions PURES : ce fichier
// classe des missions et additionne des centimes ; l'accès aux données est dans la page.
// ============================================================

import { addDays } from "./console-journey";

export type RevenueMission = {
  id: string;
  restaurantName: string;
  metier: string;
  status: string;
  /** Le prix du devis (centimes), figé à l'acceptation. */
  quoteCents: number | null;
  /** Ce que reçoit le prestataire (centimes), figé à l'acceptation, suppléments acceptés compris. */
  providerCents: number | null;
  /** Le versement manuel de la plateforme (`valide → verse`). */
  paidOutAt: string | null;
  /** L'annulation chiffrée (la part du prestataire sur la somme retenue). */
  cancellation: { providerPayoutCents?: number } | null;
  cancellationSettledAt: string | null;
  updatedAt: string;
};

export type RevenueBucket = "upcoming" | "on_hold" | "to_pay" | "paid" | "cancel_due" | "cancel_paid" | "none";

const UPCOMING = ["accepte", "date_bloquee", "production", "livre", "retouche", "suspendu"] as const;

export function bucketOf(m: RevenueMission): RevenueBucket {
  if (m.status === "litige") return "on_hold";
  if (m.status === "valide") return m.paidOutAt ? "paid" : "to_pay";
  if (m.status === "verse") return "paid";
  if (m.status === "annule") {
    const due = m.cancellation?.providerPayoutCents ?? 0;
    if (due <= 0) return "none";
    return m.cancellationSettledAt ? "cancel_paid" : "cancel_due";
  }
  if ((UPCOMING as readonly string[]).includes(m.status) && (m.providerCents ?? 0) > 0) return "upcoming";
  return "none";
}

/** Le montant que le prestataire touche pour cette mission, selon sa situation. */
export function amountOf(m: RevenueMission, bucket: RevenueBucket = bucketOf(m)): number {
  if (bucket === "none") return 0;
  if (bucket === "cancel_due" || bucket === "cancel_paid") return Math.max(0, m.cancellation?.providerPayoutCents ?? 0);
  return Math.max(0, m.providerCents ?? 0);
}

export type RevenueTotals = {
  /** Mission en cours : acceptée mais pas encore validée. */
  upcomingCents: number;
  /** En médiation : rien n'est versé tant que la plateforme n'a pas décidé. */
  onHoldCents: number;
  /** Validée, pas encore versée : Boosteats doit le virement. */
  toPayCents: number;
  /** Une annulation dont la part du prestataire n'est pas encore réglée. */
  cancelDueCents: number;
  paidThisMonthCents: number;
  paidTotalCents: number;
};

/** Le mois belge (YYYY-MM) d'un instant. */
export function brusselsMonth(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

export function revenueTotals(missions: readonly RevenueMission[], now: Date): RevenueTotals {
  const month = brusselsMonth(now.toISOString());
  const t: RevenueTotals = { upcomingCents: 0, onHoldCents: 0, toPayCents: 0, cancelDueCents: 0, paidThisMonthCents: 0, paidTotalCents: 0 };
  for (const m of missions) {
    const b = bucketOf(m);
    const a = amountOf(m, b);
    if (b === "upcoming") t.upcomingCents += a;
    else if (b === "on_hold") t.onHoldCents += a;
    else if (b === "to_pay") t.toPayCents += a;
    else if (b === "cancel_due") t.cancelDueCents += a;
    else if (b === "paid" || b === "cancel_paid") {
      t.paidTotalCents += a;
      const when = m.paidOutAt ?? (b === "cancel_paid" ? m.cancellationSettledAt : null);
      if (when && brusselsMonth(when) === month) t.paidThisMonthCents += a;
    }
  }
  return t;
}

export const BUCKET_LABEL: Record<RevenueBucket, { label: string; tone: "neutral" | "good" | "warn" }> = {
  upcoming: { label: "À venir", tone: "neutral" },
  on_hold: { label: "En médiation : rien n'est versé", tone: "warn" },
  to_pay: { label: "Validée : à verser", tone: "good" },
  paid: { label: "Versé", tone: "good" },
  cancel_due: { label: "Annulée : ta part est due", tone: "warn" },
  cancel_paid: { label: "Annulée : ta part est versée", tone: "good" },
  none: { label: "", tone: "neutral" },
};

/** Les missions qui comptent dans l'écran (les autres n'ont encore aucun montant), de la plus récente à la plus ancienne. */
export function revenueRows(missions: readonly RevenueMission[]): (RevenueMission & { bucket: RevenueBucket; amountCents: number })[] {
  return missions
    .map((m) => ({ ...m, bucket: bucketOf(m), amountCents: amountOf(m) }))
    .filter((m) => m.bucket !== "none")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Quand la validation automatique tombe, pour une livraison déposée à `deliveredAt` : le texte « versé après validation (auto à 7 jours) ». */
export function autoValidationDay(deliveredAtIso: string): string {
  return addDays(deliveredAtIso.slice(0, 10), 7);
}

export const PAYOUT_NOTE = "Tu es payé après la validation de ta livraison (par le restaurateur, ou automatiquement au bout de 7 jours). Pendant la phase pilote, Boosteats te verse le montant par virement.";
