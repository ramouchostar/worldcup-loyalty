// ADR 0104 §2 — le bon d'une pub avec offre. Module PUR et testé : aucun accès base ici
// (lib/ads/vouchers-data.ts lit et écrit). Une pub qui porte une offre mène, par son bouton
// « Obtenir l'offre », à la page /bon/<établissement>/<n° de demande> ; le passant y obtient
// un bon (code court + QR) que la caisse valide depuis la console. Aucune donnée personnelle.

import { SITE_ORIGIN } from "../site";
import type { RequestStatus } from "./meta-spec";

/** Lettres et chiffres du code : sans 0/O ni 1/I, qui se confondent à l'oral et à l'écran. */
export const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const VOUCHER_CODE_LENGTH = 6;
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Plafond de bons par heure et par empreinte d'IP (contre le remplissage). */
export const VOUCHERS_PER_IP_PER_HOUR = 20;

/** Cookie qui garde l'identifiant du bon sur l'appareil (strictement nécessaire : il ne porte rien d'autre). */
export const voucherCookieName = (requestId: string) => `bon_${requestId.replace(/-/g, "").slice(0, 16)}`;

/** Un code au hasard : `rand` rend un entier dans [0, n). */
export function newVoucherCode(rand: (n: number) => number): string {
  let s = "";
  for (let i = 0; i < VOUCHER_CODE_LENGTH; i++) s += VOUCHER_ALPHABET[rand(VOUCHER_ALPHABET.length)];
  return s;
}

/** Le code tapé par la caisse, remis en forme ; `null` s'il ne peut pas être un code. */
export function normalizeVoucherCode(input: string): string | null {
  // On ne devine pas : un 0, un O, un 1 ou un I tapé n'est jamais réécrit en une autre
  // lettre (il ne peut pas être dans un code), le code est simplement refusé.
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE_RE.test(raw) ? raw : null;
}

/** Le code affiché en deux groupes, plus facile à lire au comptoir : « K7P 4QX ». */
export const formatVoucherCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

// ── La page du bon ───────────────────────────────────────────

export type OfferFields = { text: string | null; keyword: string | null; from: string | null; to: string | null };
export type Offer = { text: string; keyword: string; from: string; to: string };

/** L'offre complète d'une demande, ou `null` (une pub sans offre n'a pas de bon). */
export function offerOf(f: OfferFields): Offer | null {
  if (!f.text?.trim() || !f.keyword?.trim() || !f.from || !f.to) return null;
  return { text: f.text.trim(), keyword: f.keyword.trim(), from: f.from, to: f.to };
}

/** Une demande dont la page du bon existe : une offre, et une pub qui n'est ni annulée ni impayée. */
export function hasVoucherPage(status: RequestStatus, offer: Offer | null): boolean {
  return offer !== null && status !== "annulee" && status !== "paiement_attendu";
}

export type OfferWindow = "avant" | "ouverte" | "finie";

/** Où en est l'offre ce jour (jours belges « AAAA-MM-JJ », bornes comprises). */
export function offerWindow(offer: Pick<Offer, "from" | "to">, today: string): OfferWindow {
  if (today < offer.from) return "avant";
  if (today > offer.to) return "finie";
  return "ouverte";
}

/** Adresse publique de la page du bon (lisible, comme la pub elle-même). */
export const voucherPath = (restaurantId: string, seq: number) => `/bon/${restaurantId}/${seq}`;

/** Le lien de la pub : la page du bon, marquée comme venant de Meta. */
export function voucherAdLink(restaurantId: string, seq: number, campaignName: string, origin = SITE_ORIGIN): string {
  const q = new URLSearchParams({ utm_source: "meta", utm_medium: "paid_social", utm_campaign: campaignName });
  return `${origin}${voucherPath(restaurantId, seq)}?${q.toString()}`;
}

/** Provenance d'un affichage de la page : la pub (utm_source=meta, ou fbclid que Meta ajoute) ou autre. */
export function viewSource(params: { utm_source?: string | null; fbclid?: string | null }): "meta" | "direct" {
  const s = (params.utm_source ?? "").toLowerCase();
  if (s === "meta" || s === "facebook" || s === "instagram" || params.fbclid) return "meta";
  return "direct";
}

// ── La caisse ────────────────────────────────────────────────

export type RedeemVerdict =
  | { ok: true; already: false }
  | { ok: true; already: true; at: string }
  | { ok: false; reason: "avant" | "finie" };

/**
 * Peut-on valider ce bon aujourd'hui ? Un bon déjà utilisé le dit (idempotent : un second
 * appui ne compte pas deux fois) ; hors des dates de l'offre, il est refusé avec la raison.
 */
export function judgeRedeem(v: { redeemedAt: string | null }, offer: Pick<Offer, "from" | "to">, today: string): RedeemVerdict {
  if (v.redeemedAt) return { ok: true, already: true, at: v.redeemedAt };
  const w = offerWindow(offer, today);
  if (w !== "ouverte") return { ok: false, reason: w };
  return { ok: true, already: false };
}

export const REDEEM_REFUSAL: Record<"avant" | "finie", string> = {
  avant: "L'offre n'a pas encore commencé : ce bon ne vaut pas encore.",
  finie: "L'offre est terminée : ce bon ne vaut plus.",
};

// ── La mesure (ADR 0104, trace) ──────────────────────────────

export type VoucherCounts = { views: number; issued: number; redeemed: number };
export const NO_VOUCHERS: VoucherCounts = { views: 0, issued: 0, redeemed: 0 };

/** Seuils de l'ADR 0104 : la page du bon, puis l'offre ou la caisse, à revoir. */
export const FUNNEL_MIN_CLICKS = 100;
export const FUNNEL_MIN_ISSUED = 30;
export const PAGE_RATE_FLOOR = 0.2;
export const REDEEM_RATE_FLOOR = 0.1;

export type FunnelFlag = "page_a_revoir" | "caisse_a_revoir";

/** Les signaux d'une pub à bon : rien tant que les volumes sont trop petits pour conclure. */
export function funnelFlags(clicks: number, c: VoucherCounts): FunnelFlag[] {
  const flags: FunnelFlag[] = [];
  if (clicks >= FUNNEL_MIN_CLICKS && c.issued / clicks < PAGE_RATE_FLOOR) flags.push("page_a_revoir");
  if (c.issued >= FUNNEL_MIN_ISSUED && c.redeemed / c.issued < REDEEM_RATE_FLOOR) flags.push("caisse_a_revoir");
  return flags;
}

export const FUNNEL_FLAG_TEXT: Record<FunnelFlag, string> = {
  page_a_revoir: "Moins d'un clic sur cinq devient un bon : la page du bon est à revoir.",
  caisse_a_revoir: "Moins d'un bon sur dix est utilisé : l'offre, ou le scan en caisse, est à revoir.",
};

// ── Le lien de la pub chez Meta ──────────────────────────────

export type AdDestination = { link: string; cta: "GET_OFFER" | "LEARN_MORE"; voucher: boolean };

/**
 * Où mène le bouton de la pub (ADR 0104 §2) : une pub « Visites » avec une offre complète mène
 * à la page du bon (« Obtenir l'offre ») ; toute autre pub garde l'itinéraire (« En savoir plus »).
 * Sans les tables des bons (migration non appliquée), on garde l'itinéraire plutôt qu'une page vide.
 */
export function adDestination(p: {
  objective: string;
  offer: Offer | null;
  vouchersReady: boolean;
  restaurantId: string;
  seq: number;
  campaignName: string;
  mapsLink: string;
  origin?: string;
}): AdDestination {
  if (p.objective === "TRAFIC" && p.offer && p.vouchersReady) {
    return { link: voucherAdLink(p.restaurantId, p.seq, p.campaignName, p.origin), cta: "GET_OFFER", voucher: true };
  }
  return { link: p.mapsLink, cta: "LEARN_MORE", voucher: false };
}

/** La ligne d'offre ajoutée au texte d'une pub à bon : le bouton remplace le mot clé à dire. */
export function voucherOfferLine(o: Offer): string {
  const d = (s: string) => `${Number(s.slice(8, 10))}/${Number(s.slice(5, 7))}`;
  return `🎁 ${o.text}, du ${d(o.from)} au ${d(o.to)}. Appuie sur « Obtenir l'offre » et montre ton bon à la caisse.`;
}
