// ADR 0103 — accès à l'API de données de Belpeople (Supabase REST), SERVEUR
// uniquement. Lecture seule. L'URL et la clé publique sont dans l'environnement
// (valeurs publiques de l'app Belpeople), jamais dans le dépôt. L'e-mail et le
// mot de passe viennent du coffre (Vault), jamais du code.

import { parseSalesRow, type DailySales } from "./model";
import type { HourlyRow } from "./hourly";
import type { ProductSaleRow } from "./products";
import { CANDIDATE_TABLES, productTables, sampleQuery, shapeOf, SAMPLE_ROWS, STORE_COLUMN_CANDIDATES, PRODUCT_REVENUE_RPC, productRevenueArgs, stripSensitive, type TableShape } from "./explore";

export function belpeopleConfig(): { url: string; anon: string } | null {
  const url = process.env.BELPEOPLE_SUPABASE_URL?.trim().replace(/\/$/, "");
  const anon = process.env.BELPEOPLE_ANON_KEY?.trim();
  return url && anon ? { url, anon } : null;
}

export class BelpeopleAuthError extends Error {}

/** Connexion e-mail + mot de passe → jeton d'accès (jamais journalisé). */
export async function signIn(email: string, password: string): Promise<string> {
  const cfg = belpeopleConfig();
  if (!cfg) throw new Error("BELPEOPLE_SUPABASE_URL / BELPEOPLE_ANON_KEY absents.");
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error_description?: string; msg?: string };
    throw new BelpeopleAuthError(body.error_description ?? body.msg ?? `connexion refusée (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new BelpeopleAuthError("jeton d'accès absent.");
  return json.access_token;
}

/**
 * CA par jour d'UN restaurant (store_id Belpeople) depuis `fromDay` inclus.
 * Lecture seule sur agg_sales_daily, colonnes de ventes uniquement.
 */
export async function readDailySales(token: string, storeRef: string, fromDay: string): Promise<DailySales[]> {
  const cfg = belpeopleConfig();
  if (!cfg) throw new Error("Belpeople non configuré.");
  const q = new URLSearchParams({
    select: "business_date_utc,gross_inc_vat,gross_exc_vat,orders_count",
    store_id: `eq.${storeRef}`,
    business_date_utc: `gte.${fromDay}`,
    order: "business_date_utc.desc",
    limit: "400",
  });
  const res = await fetch(`${cfg.url}/rest/v1/agg_sales_daily?${q}`, {
    headers: { apikey: cfg.anon, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new BelpeopleAuthError("jeton Belpeople refusé.");
  if (!res.ok) throw new Error(`Belpeople agg_sales_daily : ${res.status}`);
  const rows = (await res.json()) as unknown[];
  return rows.map(parseSalesRow).filter((d): d is DailySales => d !== null);
}

/** Ventes par heure d'UN restaurant depuis `fromDay` (hour_start >= minuit). */
export async function readHourlySales(token: string, storeRef: string, fromDay: string): Promise<HourlyRow[]> {
  const cfg = belpeopleConfig();
  if (!cfg) throw new Error("Belpeople non configuré.");
  const q = new URLSearchParams({
    select: "hour_start,gross_inc_vat,orders_count",
    store_id: `eq.${storeRef}`,
    hour_start: `gte.${fromDay}T00:00:00`,
    order: "hour_start.desc",
    limit: "5000",
  });
  const res = await fetch(`${cfg.url}/rest/v1/agg_sales_hourly?${q}`, {
    headers: { apikey: cfg.anon, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new BelpeopleAuthError("jeton Belpeople refusé.");
  if (!res.ok) throw new Error(`Belpeople agg_sales_hourly : ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows
    .filter((r) => typeof r.hour_start === "string")
    .map((r) => ({
      hour_start: r.hour_start as string,
      gross_inc_vat: r.gross_inc_vat === null || r.gross_inc_vat === undefined ? null : Number(r.gross_inc_vat),
      orders_count: r.orders_count === null || r.orders_count === undefined ? null : Number(r.orders_count),
    }));
}


/**
 * ADR 0103 §6 — quantités vendues par plat, par jour et par canal, pour UN
 * magasin depuis `fromDay` (v_agg_products_sold_daily). Lecture par pages de
 * 1 000 lignes (PostgREST tronque sans le dire) ; colonnes de vente seulement.
 */
export async function readProductSales(token: string, storeRef: string, fromDay: string): Promise<ProductSaleRow[]> {
  const cfg = belpeopleConfig();
  if (!cfg) throw new Error("Belpeople non configuré.");
  const out: ProductSaleRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 200_000; from += PAGE) {
    const q = new URLSearchParams({
      select: "business_date,sales_channel_id,sales_channel_name,product_id,product_name,num_items_sold",
      store_id: `eq.${storeRef}`,
      business_date: `gte.${fromDay}`,
      order: "business_date.asc,sales_channel_id.asc,product_id.asc",
    });
    const res = await fetch(`${cfg.url}/rest/v1/v_agg_products_sold_daily?${q}`, {
      headers: { apikey: cfg.anon, Authorization: `Bearer ${token}`, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
      cache: "no-store",
    });
    if (res.status === 401) throw new BelpeopleAuthError("jeton Belpeople refusé.");
    if (!res.ok && res.status !== 206) throw new Error(`Belpeople v_agg_products_sold_daily : ${res.status}`);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    for (const r of rows) {
      const day = typeof r.business_date === "string" ? r.business_date.slice(0, 10) : null;
      const pid = Number(r.product_id);
      const name = typeof r.product_name === "string" ? r.product_name.trim() : "";
      if (!day || !Number.isFinite(pid) || !name) continue;
      out.push({
        sales_day: day,
        channel_id: r.sales_channel_id == null ? null : Number(r.sales_channel_id),
        channel_name: typeof r.sales_channel_name === "string" ? r.sales_channel_name : null,
        product_id: pid,
        product_name: name,
        items_sold: Math.max(0, Math.trunc(Number(r.num_items_sold) || 0)),
      });
    }
    if (rows.length < PAGE) return out;
  }
  throw new Error("Belpeople v_agg_products_sold_daily : plus de 200 000 lignes, lecture arrêtée.");
}

export type ExploredTable = TableShape & { rows: Record<string, unknown>[] | null; error: string | null };

/**
 * ADR 0103 §6 — exploration en lecture seule des ventes par produit : la liste
 * des tables (description OpenAPI de PostgREST), puis quelques lignes du SEUL
 * magasin autorisé pour celles qui se filtrent sur le magasin. Rien n'est
 * enregistré chez nous.
 */
export async function exploreProductTables(token: string, storeRef: string): Promise<{ listed: boolean; tables: ExploredTable[] }> {
  const cfg = belpeopleConfig();
  if (!cfg) throw new Error("Belpeople non configuré.");
  const headers = { apikey: cfg.anon, Authorization: `Bearer ${token}` };
  const res = await fetch(`${cfg.url}/rest/v1/`, { headers: { ...headers, Accept: "application/openapi+json" }, cache: "no-store" });
  if (res.ok) {
    const spec = (await res.json()) as { definitions?: Record<string, { properties?: Record<string, unknown> }> };
    const out: ExploredTable[] = [];
    for (const t of productTables(spec.definitions ?? {})) {
      const q = sampleQuery(t, storeRef);
      if (!q) {
        out.push({ ...t, rows: null, error: null });
        continue;
      }
      const r = await fetch(`${cfg.url}/rest/v1/${encodeURIComponent(t.name)}?${q}`, { headers, cache: "no-store" });
      out.push(r.ok ? { ...t, rows: ((await r.json()) as Record<string, unknown>[]).slice(0, SAMPLE_ROWS), error: null } : { ...t, rows: null, error: `lecture refusée (${r.status})` });
    }
    return { listed: true, tables: out };
  }
  // Liste refusée (Supabase la réserve au compte de service) : sonde par noms.
  return { listed: false, tables: await probeTables(cfg.url, headers, storeRef) };
}

/**
 * Essaie chaque nom de CANDIDATE_TABLES avec un filtre sur le magasin (une
 * colonne magasin après l'autre). Jamais de lecture sans ce filtre : une table
 * qui ne se filtre pas est signalée « existe, non lue ». Les colonnes sensibles
 * sont retirées de chaque ligne avant de sortir d'ici.
 */
async function probeTables(url: string, headers: Record<string, string>, storeRef: string): Promise<ExploredTable[]> {
  const out: ExploredTable[] = [];
  for (const name of CANDIDATE_TABLES) {
    let found: ExploredTable | null = null;
    let exists = false;
    let lastStatus = 0;
    for (const col of STORE_COLUMN_CANDIDATES) {
      const q = new URLSearchParams({ select: "*", [col]: `eq.${storeRef}`, limit: String(SAMPLE_ROWS) });
      const r = await fetch(`${url}/rest/v1/${encodeURIComponent(name)}?${q}`, { headers, cache: "no-store" });
      lastStatus = r.status;
      if (r.status === 404) break; // la table n'existe pas (ou n'est pas exposée)
      exists = true;
      if (r.status === 401 || r.status === 403) break; // existe, pas pour ce compte
      if (!r.ok) continue; // 400 : pas cette colonne magasin, on essaie la suivante
      const raw = ((await r.json()) as Record<string, unknown>[]).slice(0, SAMPLE_ROWS);
      const rows = raw.map(stripSensitive);
      const columns = raw[0] ? Object.keys(raw[0]) : [];
      const shape = shapeOf(name, columns);
      found = { ...shape, storeColumn: col, rows, error: null };
      break;
    }
    if (found) out.push(found);
    else if (exists)
      out.push({
        ...shapeOf(name, []),
        rows: null,
        error: lastStatus === 401 || lastStatus === 403 ? `existe, accès refusé (${lastStatus})` : "existe, mais aucune colonne magasin : non lue",
      });
  }
  // La fonction de CA par produit et par mois, pour le seul magasin autorisé.
  const args = productRevenueArgs(storeRef);
  if (args) {
    const r = await fetch(`${url}/rest/v1/rpc/${PRODUCT_REVENUE_RPC}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (r.ok) {
      const raw = ((await r.json()) as Record<string, unknown>[]).slice(0, SAMPLE_ROWS);
      out.push({ ...shapeOf(`rpc/${PRODUCT_REVENUE_RPC}`, raw[0] ? Object.keys(raw[0]) : []), storeColumn: "p_store_ids", rows: raw.map(stripSensitive), error: null });
    } else if (r.status !== 404) {
      out.push({ ...shapeOf(`rpc/${PRODUCT_REVENUE_RPC}`, []), rows: null, error: `appel refusé (${r.status})` });
    }
  }
  return out;
}
