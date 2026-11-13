// ADR 0102 — CA lu par HubRise : règles pures (aucun accès réseau ni base).
// Testées dans lib/hubrise/model.test.ts.

import { createHmac, timingSafeEqual } from "node:crypto";

// ── Ce que HubRise envoie (sous-ensemble lu ; doc « Orders » de l'API v1) ──────

export type HubriseMoney = string | null | undefined; // « 9.00 EUR »

export type HubriseOrder = {
  id: string;
  location_id: string;
  status: string;
  created_at: string; // ISO avec décalage, ex. 2026-11-13T19:07:53+01:00
  channel?: string | null;
  service_type?: string | null;
  total?: HubriseMoney;
  items?: Array<{
    product_name?: string | null;
    sku_name?: string | null;
    quantity?: string | number | null;
    price?: HubriseMoney;
    subtotal?: HubriseMoney;
    deleted?: boolean;
  }> | null;
  discounts?: Array<{ price_off?: HubriseMoney; deleted?: boolean }> | null;
  charges?: Array<{ price?: HubriseMoney; deleted?: boolean }> | null;
  // customer, delivery, payments… existent mais ne sont JAMAIS lus (ADR 0025).
};

/** Statuts d'anomalie de HubRise : la commande n'est pas une vente. */
export const NOT_A_SALE = ["rejected", "cancelled", "delivery_failed"] as const;

export function isSale(status: string): boolean {
  return !(NOT_A_SALE as readonly string[]).includes(status);
}

/** « 12.50 EUR » → { amount: 12.5, currency: "EUR" } ; illisible → null. */
export function parseMoney(raw: HubriseMoney): { amount: number; currency: string } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s+([A-Z]{3})\s*$/.exec(raw ?? "");
  if (!m) return null;
  return { amount: Math.round(Number(m[1]) * 100) / 100, currency: m[2] };
}

// ── Jour de vente ───────────────────────────────────────────────────────────

/** Avant cette heure (Bruxelles), une commande compte pour la veille (ADR 0087 §4). */
export const DAY_CUTOFF_HOUR = 5;

function brusselsParts(d: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Jour de vente d'un instant : date à Bruxelles, la veille avant 5 h. */
export function salesDayOf(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const { day, hour } = brusselsParts(new Date(t));
  return hour < DAY_CUTOFF_HOUR ? shiftDay(day, -1) : day;
}

/**
 * Fenêtre à demander à l'API pour couvrir un jour de vente, en UTC. Elle est
 * un peu large (5 h à Bruxelles = 3 h ou 4 h UTC selon la saison) : on filtre
 * ensuite par salesDayOf. `after` inclusif, `before` exclusif (doc HubRise).
 */
export function apiWindowFor(day: string): { after: string; before: string } {
  return { after: `${day}T02:00:00Z`, before: `${shiftDay(day, 1)}T05:00:00Z` };
}

// ── Canaux (mêmes clés que la saisie de l'ADR 0087) ─────────────────────────

export type ChannelKey = "uber" | "deliveroo" | "takeaway" | "autre";

export const CHANNEL_LABEL: Record<ChannelKey, string> = {
  uber: "Uber Eats",
  deliveroo: "Deliveroo",
  takeaway: "Takeaway",
  autre: "Autre",
};

export function channelKey(channel: string | null | undefined): ChannelKey {
  const c = (channel ?? "").toLowerCase();
  if (c.includes("uber")) return "uber";
  if (c.includes("deliveroo")) return "deliveroo";
  if (c.includes("takeaway") || c.includes("just eat")) return "takeaway";
  return "autre";
}

// ── Ce qu'on garde d'une commande (jamais de donnée client) ─────────────────

export type StoredOrder = {
  external_id: string;
  location_id: string;
  placed_at: string;
  sales_day: string;
  channel: string | null;
  service_type: string | null;
  status: string;
  total: number | null;
  currency: string | null;
  discounts: number | null;
  charges: number | null;
  items: Array<{ product_name: string | null; sku_name: string | null; quantity: number | null; price: number | null; subtotal: number | null }>;
};

const sumMoney = (list: Array<{ deleted?: boolean } & Record<string, unknown>> | null | undefined, field: string): number | null => {
  if (!list || list.length === 0) return null;
  let s = 0;
  for (const x of list) {
    if (x.deleted) continue;
    s += parseMoney(x[field] as HubriseMoney)?.amount ?? 0;
  }
  return Math.round(s * 100) / 100;
};

/** Retire tout ce qui n'est pas la vente : client, livraison, paiements, notes. */
export function toStoredOrder(o: HubriseOrder): StoredOrder | null {
  const day = salesDayOf(o.created_at);
  if (!o.id || !day) return null;
  const total = parseMoney(o.total);
  return {
    external_id: o.id,
    location_id: o.location_id,
    placed_at: o.created_at,
    sales_day: day,
    channel: o.channel ?? null,
    service_type: o.service_type ?? null,
    status: o.status,
    total: total?.amount ?? null,
    currency: total?.currency ?? null,
    discounts: sumMoney(o.discounts, "price_off"),
    charges: sumMoney(o.charges, "price"),
    items: (o.items ?? [])
      .filter((i) => !i.deleted)
      .map((i) => ({
        product_name: i.product_name ?? null,
        sku_name: i.sku_name ?? null,
        quantity: i.quantity === null || i.quantity === undefined ? null : Number(i.quantity),
        price: parseMoney(i.price)?.amount ?? null,
        subtotal: parseMoney(i.subtotal)?.amount ?? null,
      })),
  };
}

// ── Le jour par canal, et l'écart à la référence ────────────────────────────

export type OrderRow = {
  sales_day: string;
  channel: string | null;
  status: string;
  total: number | null;
  first_received_via: "callback" | "sync";
};

export type DayChannel = { orders: number; amount: number; excluded: number };
export type DaySummary = {
  channels: Partial<Record<ChannelKey, DayChannel>>;
  viaCallback: number;
  all: number;
};

export function summarizeByDay(rows: OrderRow[]): Map<string, DaySummary> {
  const out = new Map<string, DaySummary>();
  for (const r of rows) {
    const d = out.get(r.sales_day) ?? { channels: {}, viaCallback: 0, all: 0 };
    const k = channelKey(r.channel);
    const c = d.channels[k] ?? { orders: 0, amount: 0, excluded: 0 };
    if (isSale(r.status)) {
      c.orders += 1;
      c.amount = Math.round((c.amount + (r.total ?? 0)) * 100) / 100;
    } else {
      c.excluded += 1;
    }
    d.channels[k] = c;
    d.all += 1;
    if (r.first_received_via === "callback") d.viaCallback += 1;
    out.set(r.sales_day, d);
  }
  return out;
}

/** Écart HubRise − référence ; pct sur la référence (null si référence nulle). */
export function gap(hubrise: number, reference: number): { eur: number; pct: number | null } {
  const eur = Math.round((hubrise - reference) * 100) / 100;
  return { eur, pct: reference > 0 ? Math.round((eur / reference) * 1000) / 10 : null };
}

/** Seuil de l'ADR 0102 §4 pour pré-remplir un canal. */
export const PREFILL_MAX_GAP_PCT = 2;
export const PREFILL_MIN_DAYS = 14;

// ── Signatures ──────────────────────────────────────────────────────────────

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Rappel HubRise : HMAC-SHA256 hex du corps brut, clé = secret client. */
export function verifyCallbackSignature(rawBody: string, header: string | null, clientSecret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", clientSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, header.trim().toLowerCase());
}

/** Paramètre `state` du flux OAuth : établissement + super-admin + heure, signés. */
export const STATE_TTL_MS = 15 * 60 * 1000;

export function signState(payload: { r: string; u: string; t: number }, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readState(state: string | null, secret: string, now = Date.now()): { r: string; u: string; t: number } | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqualHex(expected, sig)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof p?.r !== "string" || typeof p?.u !== "string" || typeof p?.t !== "number") return null;
    if (now - p.t > STATE_TTL_MS || p.t > now + 60_000) return null;
    return p;
  } catch {
    return null;
  }
}
