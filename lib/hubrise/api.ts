// ADR 0102 — appels à HubRise (serveur uniquement : le secret client n'en sort
// jamais). Doc : https://www.hubrise.com/developers/api/authentication,
// …/api/orders, …/api/callbacks, …/api/general-concepts (pagination).

import type { HubriseOrder } from "./model";

const OAUTH = "https://manager.hubrise.com/oauth2/v1";
const API = "https://api.hubrise.com/v1";

/** Lecture des commandes d'UN point de vente, rien d'autre (ADR 0102 §1). */
export const HUBRISE_SCOPE = "location[orders.read]";

export function hubriseCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.HUBRISE_CLIENT_ID?.trim();
  const clientSecret = process.env.HUBRISE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Erreur 401 : jeton révoqué, connexion bloquée ou abonnement suspendu. */
export class HubriseUnauthorized extends Error {}

export function authorizeUrl(opts: { clientId: string; redirectUri: string; state: string; locationName?: string }): string {
  const p = new URLSearchParams({
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    scope: HUBRISE_SCOPE,
    country: "BE",
    state: opts.state,
  });
  if (opts.locationName) p.set("location_name", opts.locationName);
  return `${OAUTH}/authorize?${p}`;
}

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

export type TokenResponse = {
  access_token: string;
  account_id?: string;
  location_id?: string;
  account_name?: string;
  location_name?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const cred = hubriseCredentials();
  if (!cred) throw new Error("HUBRISE_CLIENT_ID / HUBRISE_CLIENT_SECRET absents.");
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basic(cred.clientId, cred.clientSecret) },
    body: new URLSearchParams({ code }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HubRise /token : ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token || !json.location_id) throw new Error("HubRise /token : jeton ou point de vente absent.");
  return json;
}

export async function revokeToken(token: string): Promise<void> {
  const cred = hubriseCredentials();
  if (!cred) return;
  await fetch(`${OAUTH}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basic(cred.clientId, cred.clientSecret) },
    body: new URLSearchParams({ token }),
    cache: "no-store",
  });
}

async function call(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "X-Access-Token": token, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new HubriseUnauthorized(body.message ?? "Jeton refusé par HubRise.");
  }
  return res;
}

/** Commandes du point de vente créées dans [after, before[, toutes les pages. */
export async function listOrders(token: string, after: string, before: string): Promise<HubriseOrder[]> {
  const out: HubriseOrder[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const p = new URLSearchParams({ after, before, count: "100" });
    if (cursor) p.set("cursor", cursor);
    const res = await call(token, `/location/orders?${p}`);
    if (!res.ok) throw new Error(`HubRise /location/orders : ${res.status}`);
    out.push(...((await res.json()) as HubriseOrder[]));
    cursor = res.headers.get("X-Cursor-Next");
    if (!cursor) return out;
  }
  throw new Error("HubRise /location/orders : plus de 50 pages, lecture arrêtée.");
}

/** Rappel actif de la connexion : HubRise POSTe chaque commande créée ou modifiée. */
export async function setCallback(token: string, url: string): Promise<void> {
  const res = await call(token, "/callback", {
    method: "POST",
    body: JSON.stringify({ url, events: { order: ["create", "update"] } }),
  });
  if (!res.ok) throw new Error(`HubRise /callback : ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
}

export async function deleteCallback(token: string): Promise<void> {
  await call(token, "/callback", { method: "DELETE" });
}
