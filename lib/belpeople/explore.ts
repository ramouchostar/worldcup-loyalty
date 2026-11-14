// ADR 0103 §6 (exploration, 2026-11-14) — règles PURES pour explorer les
// ventes par produit de Belpeople avant de construire « Ventes par plat » sur
// le total de la caisse. Testé dans explore.test.ts.
//
// Garde-fous : on ne lit des lignes QUE filtrées sur le magasin autorisé
// (store_id), jamais une colonne qui pourrait porter une donnée client, et
// seulement quelques lignes. Une table sans store_id est décrite (colonnes),
// jamais lue : elle mêlerait les 64 restaurants de la chaîne.

/** Une table ou vue intéressante pour les ventes par produit. */
export const PRODUCT_TABLE = /(product|produit|item|article|menu|categor|odoo|sale|line)/i;
/** Ce qu'on ne lit jamais, même en exploration (ADR 0025 : aucune donnée client). */
export const SENSITIVE_COLUMN = /(email|mail|phone|tel|gsm|address|adresse|street|customer|client|partner|firstname|lastname|first_name|last_name|birth|iban|card|token|password|ip_)/i;
/** Colonnes qui portent le magasin, dans l'ordre de préférence. */
const STORE_COLUMNS = ["store_id", "store", "restaurant_id", "location_id", "shop_id"];
/** Colonnes qui disent la période (jour, mois…), pour trier et juger la finesse. */
const DATE_COLUMN = /(date|day|month|week|period|hour|_at$)/i;

export const SAMPLE_ROWS = 5;
export const MAX_TABLES = 12;

export type TableShape = {
  name: string;
  columns: string[];
  storeColumn: string | null;
  dateColumn: string | null;
  /** Colonnes lues dans l'échantillon (sans les sensibles). */
  readable: string[];
  hidden: string[];
};

/** Les tables et vues de l'API (définitions OpenAPI de PostgREST) → formes utiles. */
export function productTables(definitions: Record<string, { properties?: Record<string, unknown> }>): TableShape[] {
  return Object.entries(definitions)
    .filter(([name]) => PRODUCT_TABLE.test(name))
    .map(([name, def]) => shapeOf(name, Object.keys(def.properties ?? {})))
    .sort((a, b) => Number(b.storeColumn !== null) - Number(a.storeColumn !== null) || a.name.localeCompare(b.name))
    .slice(0, MAX_TABLES);
}

export function shapeOf(name: string, columns: string[]): TableShape {
  const storeColumn = STORE_COLUMNS.find((c) => columns.includes(c)) ?? null;
  const dateColumn = columns.find((c) => DATE_COLUMN.test(c)) ?? null;
  const hidden = columns.filter((c) => SENSITIVE_COLUMN.test(c));
  return { name, columns, storeColumn, dateColumn, readable: columns.filter((c) => !hidden.includes(c)), hidden };
}

/** La requête d'échantillon, ou null si la table ne peut pas être filtrée sur le magasin. */
export function sampleQuery(t: TableShape, storeRef: string): URLSearchParams | null {
  if (!t.storeColumn || t.readable.length === 0) return null;
  const q = new URLSearchParams({ select: t.readable.join(","), [t.storeColumn]: `eq.${storeRef}`, limit: String(SAMPLE_ROWS) });
  if (t.dateColumn && t.readable.includes(t.dateColumn)) q.set("order", `${t.dateColumn}.desc`);
  return q;
}

// ── Sonde par noms (2026-11-14) ────────────────────────────────────────────────
// Belpeople refuse la liste des tables (description OpenAPI réservée au compte
// de service, 401) : on essaie des noms connus ou probables, un par un.

/** Noms essayés quand la liste des tables est refusée. Le premier est connu (essai du 2026-11-14). */
export const CANDIDATE_TABLES = [
  "v_odoo_product_sales_monthly",
  "v_odoo_product_sales_daily",
  "v_odoo_product_sales_weekly",
  "v_odoo_product_sales",
  "odoo_product_sales",
  "agg_product_sales_daily",
  "agg_sales_product_daily",
  "agg_sales_daily_product",
  "agg_product_sales",
  "agg_sales_by_product",
  "product_sales_daily",
  "product_sales",
  "v_product_sales",
  "agg_category_sales_daily",
  "v_odoo_products",
  "odoo_products",
  "products",
];

/** Colonnes magasin essayées, dans l'ordre. */
export const STORE_COLUMN_CANDIDATES = ["store_id", "restaurant_id", "location_id", "shop_id", "store"];

/** Une ligne lue → seulement ses colonnes non sensibles (rien d'autre ne sort de la lecture). */
export function stripSensitive(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !SENSITIVE_COLUMN.test(k)));
}
