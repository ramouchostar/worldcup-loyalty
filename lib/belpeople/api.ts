// ADR 0103 — accès à l'API de données de Belpeople (Supabase REST), SERVEUR
// uniquement. Lecture seule. L'URL et la clé publique sont dans l'environnement
// (valeurs publiques de l'app Belpeople), jamais dans le dépôt. L'e-mail et le
// mot de passe viennent du coffre (Vault), jamais du code.

import { parseSalesRow, type DailySales } from "./model";
import type { HourlyRow } from "./hourly";

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
