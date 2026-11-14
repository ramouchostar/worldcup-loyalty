// ADR 0103 — CA total lu dans Belpeople : règles pures (aucun réseau ni base).
// Testé dans lib/belpeople/model.test.ts.

export { gap } from "@/lib/hubrise/model";

/** Belpeople se remplit en différé : on relit une fenêtre, pas « hier » seul. */
export const WINDOW_DAYS = 10;
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
