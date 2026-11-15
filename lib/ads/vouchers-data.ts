// ADR 0104 §2 — lecture et écriture des bons de pub (service-role). La logique vit dans
// lib/ads/vouchers.ts. Tolérant à l'absence de la migration 20261115-1200-bons-de-pub :
// sans les tables, `ready` est faux, la page du bon dit « indisponible » et la pub garde
// son lien vers l'itinéraire. Chaque échec d'écriture se dit dans les journaux (`[bon]`).

import { randomBytes, randomInt } from "node:crypto";
import { createAdminClient } from "../supabase";
import { isMissingTable } from "../funnel";
import { logoPublicUrl } from "../restaurant";
import type { RequestStatus } from "./meta-spec";
import {
  VOUCHERS_PER_IP_PER_HOUR,
  hasVoucherPage,
  newVoucherCode,
  offerOf,
  type Offer,
  type VoucherCounts,
} from "./vouchers";

/** Les tables des bons existent-elles ? (une lecture vide, sans erreur, suffit) */
export async function vouchersReady(): Promise<boolean> {
  const { error } = await createAdminClient().from("ad_vouchers").select("id", { head: true, count: "exact" }).limit(1);
  if (error && !isMissingTable(error)) console.error("[bon] lecture de ad_vouchers :", error.message);
  return !error;
}

export type VoucherPage = {
  requestId: string;
  restaurantId: string;
  restaurantName: string;
  address: string | null;
  logoUrl: string | null;
  mapsUrl: string | null;
  offer: Offer;
  thumbnail: string | null;
};

/** La page /bon/<établissement>/<n°> : `null` si elle n'existe pas (pas d'offre, demande annulée ou impayée). */
export async function loadVoucherPage(restaurantId: string, seq: number): Promise<VoucherPage | null> {
  if (!Number.isInteger(seq) || seq < 1) return null;
  const db = createAdminClient();
  const { data, error } = await db
    .from("ad_requests")
    .select("id, status, offer_text, offer_keyword, offer_from, offer_to, creative")
    .eq("restaurant_id", restaurantId)
    .eq("seq", seq)
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error("[bon] lecture de la demande :", error.message);
    return null;
  }
  const r = data as { id: string; status: RequestStatus; offer_text: string | null; offer_keyword: string | null; offer_from: string | null; offer_to: string | null; creative: { thumbnail?: string | null } | null } | null;
  if (!r) return null;
  const offer = offerOf({ text: r.offer_text, keyword: r.offer_keyword, from: r.offer_from, to: r.offer_to });
  if (!offer || !hasVoucherPage(r.status, offer)) return null;
  const { data: rest } = await db.from("restaurants").select("id, name, address, logo_url, lat, lng, google_place_id, google_maps_url").eq("id", restaurantId).maybeSingle();
  const x = rest as { id: string; name: string; address: string | null; logo_url: string | null; lat: number | null; lng: number | null; google_place_id: string | null; google_maps_url: string | null } | null;
  if (!x) return null;
  let mapsUrl = x.google_maps_url;
  if (!mapsUrl && x.lat !== null && x.lng !== null) {
    const q = new URLSearchParams({ api: "1", destination: `${x.lat},${x.lng}` });
    if (x.google_place_id) q.set("destination_place_id", x.google_place_id);
    mapsUrl = `https://www.google.com/maps/dir/?${q.toString()}`;
  }
  return {
    requestId: r.id,
    restaurantId,
    restaurantName: x.name,
    address: x.address,
    logoUrl: logoPublicUrl(x.logo_url),
    mapsUrl,
    offer,
    thumbnail: r.creative?.thumbnail ?? null,
  };
}

/** Un affichage de la page du bon. Ne bloque jamais la page : un échec se dit dans les journaux. */
export async function recordVoucherView(requestId: string, source: "meta" | "direct"): Promise<void> {
  const { error } = await createAdminClient().from("ad_voucher_views").insert({ request_id: requestId, source });
  if (error && !isMissingTable(error)) console.error("[bon] vue non comptée :", error.message);
}

export type VoucherRow = {
  id: string;
  request_id: string;
  restaurant_id: string;
  code: string;
  token: string;
  created_at: string;
  redeemed_at: string | null;
};

const COLS = "id, request_id, restaurant_id, code, token, created_at, redeemed_at";

/** Le bon gardé par le cookie de l'appareil, s'il est bien de cette pub. */
export async function getVoucherForDevice(id: string, requestId: string): Promise<VoucherRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient().from("ad_vouchers").select(COLS).eq("id", id).eq("request_id", requestId).maybeSingle();
  return (data as VoucherRow | null) ?? null;
}

export type IssueResult = { ok: true; voucher: VoucherRow } | { ok: false; reason: "limite" | "indisponible" };

/**
 * Un nouveau bon : refus au-delà de 20 bons par heure pour la même empreinte d'IP. Un code
 * déjà pris chez cet établissement (unicité en base) se retire au hasard, trois essais au plus.
 */
export async function issueVoucher(page: Pick<VoucherPage, "requestId" | "restaurantId">, ipHash: string): Promise<IssueResult> {
  const db = createAdminClient();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countErr } = await db.from("ad_vouchers").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo);
  if (countErr) {
    console.error("[bon] comptage par empreinte :", countErr.message);
    return { ok: false, reason: "indisponible" };
  }
  if ((count ?? 0) >= VOUCHERS_PER_IP_PER_HOUR) {
    console.warn(`[bon] plafond atteint : ${count} bons en une heure pour une même empreinte (${page.restaurantId})`);
    return { ok: false, reason: "limite" };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = {
      request_id: page.requestId,
      restaurant_id: page.restaurantId,
      code: newVoucherCode((n) => randomInt(n)),
      token: randomBytes(18).toString("base64url"),
      ip_hash: ipHash,
    };
    const { data, error } = await db.from("ad_vouchers").insert(row).select(COLS).single();
    if (!error && data) return { ok: true, voucher: data as VoucherRow };
    if (error?.code !== "23505") {
      console.error("[bon] création :", error?.message);
      return { ok: false, reason: "indisponible" };
    }
  }
  console.error("[bon] création : trois codes déjà pris de suite");
  return { ok: false, reason: "indisponible" };
}

export type VoucherForCashier = VoucherRow & { offer: Offer; restaurantName: string };

async function withOffer(v: VoucherRow | null): Promise<VoucherForCashier | null> {
  if (!v) return null;
  const db = createAdminClient();
  const [{ data: req }, { data: rest }] = await Promise.all([
    db.from("ad_requests").select("offer_text, offer_keyword, offer_from, offer_to").eq("id", v.request_id).maybeSingle(),
    db.from("restaurants").select("name").eq("id", v.restaurant_id).maybeSingle(),
  ]);
  const r = req as { offer_text: string | null; offer_keyword: string | null; offer_from: string | null; offer_to: string | null } | null;
  const offer = r ? offerOf({ text: r.offer_text, keyword: r.offer_keyword, from: r.offer_from, to: r.offer_to }) : null;
  if (!offer) return null;
  return { ...v, offer, restaurantName: (rest as { name: string } | null)?.name ?? v.restaurant_id };
}

/** Le bon d'un QR scanné à la caisse. */
export async function getVoucherByToken(token: string): Promise<VoucherForCashier | null> {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return null;
  const { data, error } = await createAdminClient().from("ad_vouchers").select(COLS).eq("token", token).maybeSingle();
  if (error && !isMissingTable(error)) console.error("[bon] lecture par jeton :", error.message);
  return withOffer((data as VoucherRow | null) ?? null);
}

/** Le bon dont la caisse a tapé le code, chez CET établissement. */
export async function getVoucherByCode(restaurantId: string, code: string): Promise<VoucherForCashier | null> {
  const { data, error } = await createAdminClient().from("ad_vouchers").select(COLS).eq("restaurant_id", restaurantId).eq("code", code).maybeSingle();
  if (error && !isMissingTable(error)) console.error("[bon] lecture par code :", error.message);
  return withOffer((data as VoucherRow | null) ?? null);
}

/**
 * Marque le bon utilisé, une seule fois : la mise à jour ne touche qu'un bon pas encore
 * utilisé. Renvoie l'heure d'utilisation (la sienne, ou celle du premier appui).
 */
export async function markVoucherRedeemed(id: string, userId: string): Promise<{ ok: true; at: string } | { ok: false }> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db.from("ad_vouchers").update({ redeemed_at: now, redeemed_by: userId }).eq("id", id).is("redeemed_at", null).select("redeemed_at").maybeSingle();
  if (error) {
    console.error("[bon] validation en caisse :", error.message);
    return { ok: false };
  }
  if (data) return { ok: true, at: (data as { redeemed_at: string }).redeemed_at };
  const again = await db.from("ad_vouchers").select("redeemed_at").eq("id", id).maybeSingle();
  const at = (again.data as { redeemed_at: string | null } | null)?.redeemed_at;
  return at ? { ok: true, at } : { ok: false };
}

/**
 * Vues, bons obtenus et bons utilisés, par demande de pub. Des COMPTAGES (en-tête seul) :
 * une lecture de lignes plafonne à 1 000 chez Supabase et fausserait les chiffres.
 * Vide si les tables manquent ; une autre erreur se dit dans les journaux.
 */
export async function voucherCounts(requestIds: string[]): Promise<Map<string, VoucherCounts>> {
  const out = new Map<string, VoucherCounts>();
  if (requestIds.length === 0) return out;
  const db = createAdminClient();
  const head = { count: "exact" as const, head: true };
  try {
    await Promise.all(
      requestIds.map(async (id) => {
        const [views, issued, redeemed] = await Promise.all([
          db.from("ad_voucher_views").select("id", head).eq("request_id", id),
          db.from("ad_vouchers").select("id", head).eq("request_id", id),
          db.from("ad_vouchers").select("id", head).eq("request_id", id).not("redeemed_at", "is", null),
        ]);
        const e = views.error ?? issued.error ?? redeemed.error;
        if (e) throw e;
        out.set(id, { views: views.count ?? 0, issued: issued.count ?? 0, redeemed: redeemed.count ?? 0 });
      })
    );
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (!isMissingTable(err)) console.error("[bon] comptage :", err.message);
    return new Map();
  }
  return out;
}

/** Les derniers bons utilisés chez un établissement (page caisse). */
export async function recentRedemptions(restaurantId: string, limit = 10): Promise<{ code: string; redeemedAt: string; offer: string | null }[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("ad_vouchers")
    .select("code, redeemed_at, ad_requests(offer_text)")
    .eq("restaurant_id", restaurantId)
    .not("redeemed_at", "is", null)
    .order("redeemed_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!isMissingTable(error)) console.error("[bon] derniers bons :", error.message);
    return [];
  }
  return ((data ?? []) as unknown as { code: string; redeemed_at: string; ad_requests: { offer_text: string | null } | null }[]).map((r) => ({
    code: r.code,
    redeemedAt: r.redeemed_at,
    offer: r.ad_requests?.offer_text ?? null,
  }));
}
