import { createAdminClient } from "../supabase";
import { pubConfig } from "./config";

// ADR 0085 §4 + ADR 0086 — le seul endroit qui parle à la Marketing API de Meta.
// Serveur uniquement. Un seul jeton : celui du System User (META_ADS_SYSTEM_USER_TOKEN).
// Chaque écriture est journalisée dans `ad_api_calls`, réussie ou non ; une lecture
// n'y va que si elle échoue. Le jeton n'est JAMAIS écrit (ni dans le journal, ni dans
// une erreur renvoyée) : aucun échec silencieux, aucune fuite.

export const GRAPH_VERSION = "v24.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaError = { message: string; code?: number; subcode?: number; userTitle?: string; userMessage?: string; status: number };
export type MetaResult<T> = { ok: true; data: T } | { ok: false; error: MetaError };

export type CallContext = { actor: string; campaignId?: string | null; requestId?: string | null };

type Params = Record<string, unknown>;

function encode(params: Params): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  return body;
}

function scrub<T>(v: T, token: string): T {
  return JSON.parse(JSON.stringify(v ?? null).split(token).join("[jeton]")) as T;
}

async function log(entry: {
  ctx: CallContext;
  method: string;
  path: string;
  params: Params;
  status: number;
  ok: boolean;
  response: unknown;
  error: string | null;
}): Promise<void> {
  try {
    const { error } = await createAdminClient().from("ad_api_calls").insert({
      regie: "META",
      actor: entry.ctx.actor,
      method: entry.method,
      path: entry.path,
      params: entry.params,
      http_status: entry.status,
      ok: entry.ok,
      response: entry.response,
      error: entry.error,
      campaign_id: entry.ctx.campaignId ?? null,
      request_id: entry.ctx.requestId ?? null,
    });
    if (error) throw error;
  } catch (e) {
    // Le journal manque (migration absente) : on le dit dans les journaux Vercel, l'appel garde son résultat.
    console.error("[ads/meta-api] journal ad_api_calls indisponible:", (e as Error).message);
  }
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, params: Params, ctx: CallContext | null): Promise<MetaResult<T>> {
  const meta = pubConfig().meta;
  if (!meta) return { ok: false, error: { message: "META_ADS_SYSTEM_USER_TOKEN ou META_ADS_ACCOUNT_ID_BE absent", status: 0 } };
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  let init: RequestInit;
  if (method === "GET") {
    encode(params).forEach((v, k) => url.searchParams.set(k, v));
    url.searchParams.set("access_token", meta.token);
    init = { method };
  } else {
    const body = encode(params);
    body.set("access_token", meta.token);
    init = { method, body, headers: { "Content-Type": "application/x-www-form-urlencoded" } };
  }

  let status = 0;
  let json: unknown = null;
  let error: MetaError | null = null;
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    status = res.status;
    json = await res.json().catch(() => null);
    const e = (json as { error?: { message?: string; code?: number; error_subcode?: number; error_user_title?: string; error_user_msg?: string } } | null)?.error;
    if (!res.ok || e) {
      error = { message: e?.message ?? `HTTP ${res.status}`, code: e?.code, subcode: e?.error_subcode, userTitle: e?.error_user_title, userMessage: e?.error_user_msg, status };
    }
  } catch (e) {
    error = { message: `réseau : ${(e as Error).message}`, status };
  }
  if (error) error = scrub(error, meta.token);

  if (ctx && (method !== "GET" || error)) {
    await log({ ctx, method, path, params: scrub(params, meta.token), status, ok: !error, response: scrub(json, meta.token), error: error ? `${error.message}${error.userMessage ? ` — ${error.userMessage}` : ""}` : null });
  }
  return error ? { ok: false, error } : { ok: true, data: json as T };
}

export const metaGet = <T>(path: string, params: Params = {}, ctx: CallContext | null = { actor: "system" }) => call<T>("GET", path, params, ctx);
export const metaPost = <T>(path: string, params: Params, ctx: CallContext) => call<T>("POST", path, params, ctx);
export const metaDelete = <T>(path: string, ctx: CallContext) => call<T>("DELETE", path, {}, ctx);

/** Toutes les pages d'une liste (suit `paging.next`, 20 pages au plus). */
export async function metaGetAll<T>(path: string, params: Params, ctx: CallContext | null = { actor: "system" }): Promise<MetaResult<T[]>> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await metaGet<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, { limit: 100, ...params, ...(after ? { after } : {}) }, ctx);
    if (!r.ok) return r;
    out.push(...(r.data.data ?? []));
    if (!r.data.paging?.next) break;
    after = r.data.paging.cursors?.after;
    if (!after) break;
  }
  return { ok: true, data: out };
}

/** Le compte publicitaire configuré (« act_… »). */
export function adAccount(): string | null {
  return pubConfig().meta?.adAccountId ?? null;
}

/** Un message lisible pour Mehdi à partir d'une erreur Meta. */
export function describeMetaError(e: MetaError): string {
  return [e.userTitle, e.userMessage ?? e.message].filter(Boolean).join(" — ");
}
