// ADR 0103 — CA total lu dans Belpeople : règles pures (aucun réseau ni base).
// Testé dans lib/belpeople/model.test.ts.

export { gap } from "@/lib/hubrise/model";

/** Belpeople se remplit en différé (parfois ~6 jours) : on relit une fenêtre large. */
export const WINDOW_DAYS = 14;
/** Rechargement de l'historique à la demande (bouton « Recharger l'historique »). */
export const BACKFILL_DAYS = 120;
export const PREFILL_MAX_GAP_PCT = 2;
export const PREFILL_MIN_DAYS = 14;

function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Premier jour (inclus) de la fenêtre à relire, en finissant à `today`. */
export function windowStart(today: string, days = WINDOW_DAYS): string {
  return shiftDay(today, -(days - 1));
}

export type DailySales = {
  sales_day: string;
  gross_inc_vat: number | null;
  gross_exc_vat: number | null;
  orders_count: number | null;
};

/** Une ligne agg_sales_daily de Belpeople → notre forme ; null si inexploitable. */
export function parseSalesRow(raw: unknown): DailySales | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const day = typeof r.business_date_utc === "string" ? r.business_date_utc.slice(0, 10) : null;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
  return {
    sales_day: day,
    gross_inc_vat: num(r.gross_inc_vat),
    gross_exc_vat: num(r.gross_exc_vat),
    orders_count: r.orders_count === null || r.orders_count === undefined ? null : Math.trunc(Number(r.orders_count)) || 0,
  };
}

/** Un jour « vide » (0 commande, 0 €) n'est pas encore rempli : il ne compte pas. */
export function isFilled(d: DailySales): boolean {
  return (d.orders_count ?? 0) > 0 && (d.gross_inc_vat ?? 0) > 0;
}

// ── ADR 0103 §4 (amendé le 2026-11-14) — Belpeople remplace la saisie ─────────

/** Ce que le cron écrit dans daily_revenue_entries pour un jour rempli chez Belpeople. */
export type RevenueEntryFromPos = { sales_day: string; amount: number; tickets: number | null };

/**
 * Les jours à écrire comme CA du jour : remplis (≠ 0 €, ≠ 0 commande) et
 * terminés (jamais aujourd'hui, encore en cours). Un jour vide n'est PAS un
 * jour à 0 € : il attend que Belpeople se remplisse.
 */
export function revenueEntriesFrom(rows: DailySales[], today: string): RevenueEntryFromPos[] {
  return rows
    .filter((d) => d.sales_day < today && isFilled(d))
    .map((d) => ({ sales_day: d.sales_day, amount: d.gross_inc_vat as number, tickets: d.orders_count }));
}

/** Au-delà de ce retard, un jour toujours vide chez Belpeople est signalé (rouge sur /platform/ca). */
export const STALE_AFTER_DAYS = 10;

/**
 * Les jours de vente encore vides chez Belpeople alors qu'ils devraient être
 * remplis (plus de STALE_AFTER_DAYS jours), sur les `span` derniers jours.
 * Un jour fermé ressort aussi : c'est à l'équipe de juger, jamais un 0 €.
 */
export function staleDays(rows: DailySales[], today: string, span = 30): string[] {
  const filled = new Set(rows.filter(isFilled).map((d) => d.sales_day));
  const out: string[] = [];
  for (let i = STALE_AFTER_DAYS + 1; i < span; i++) {
    const d = shiftDay(today, -i);
    if (!filled.has(d)) out.push(d);
  }
  return out;
}

// ── Plateformes de livraison (constat du 2026-11-14) ──────────────────────────
// À Kraainem, Uber Eats passe par la caisse : Belpeople a un canal « UberEats »
// et son total est le CA complet. À Houba et De Bue, Uber Eats et Deliveroo
// passent hors caisse : Belpeople n'a que la caisse (≈ 70 % du CA saisi à la
// main). Belpeople ne remplace donc la saisie que là où il voit les plateformes.

const PLATFORM_CHANNEL = /uber|deliveroo/i;

/** Belpeople voit-il les ventes des plateformes de livraison de cet établissement ? */
export function coversPlatforms(channelNames: (string | null)[]): boolean {
  return channelNames.some((c) => !!c && PLATFORM_CHANNEL.test(c));
}

/** Les jours que Belpeople peut écrire : jamais un jour déjà saisi à la main (source ≠ belpeople). */
export function daysBelpeopleMayWrite(days: string[], existing: { sales_day: string; source: string | null }[]): string[] {
  const manual = new Set(existing.filter((e) => e.source !== "belpeople").map((e) => e.sales_day));
  return days.filter((d) => !manual.has(d));
}
