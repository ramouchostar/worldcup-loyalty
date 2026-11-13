// ADR 0099 §2 et §6, ADR 0100 §11 — la commande du site : ce qu'un client envoie, ce que le SERVEUR en retient. Logique PURE
// et testée. Règle de fer : le navigateur envoie des identifiants de plats, des quantités et des choix, JAMAIS un prix ni un
// nom de plat ; tout le reste (prix, noms, coins de cuisine, lignes lisibles) est recalculé ici à partir du catalogue.

import { describeSelection, priceCents, validateSelection } from "../menu-options/model";
import { MAX_ZONE, cleanFirstName, cleanZone, type TicketLine } from "../menu-options/tickets";
import type { OptionGroup, Selection } from "../menu-options/types";

export const MAX_LINES = 30;
export const MAX_QTY = 20;
/** Un plafond qui arrête l'erreur de frappe et l'abus, pas un client : 500 € pour un retrait au comptoir. */
export const MAX_TOTAL_CENTS = 50_000;

// ─── Le drapeau : tout est FERMÉ tant que l'établissement n'est pas listé ───

/** `SITE_ORDER_RESTAURANTS` = identifiants séparés par des virgules, ou « * ». Vide = fermé partout (pas de super-admin ici : un vrai client ne doit jamais pouvoir commander par accident). */
export function siteOrdersEnabledFor(restaurantId: string, env: string | undefined = process.env.SITE_ORDER_RESTAURANTS): boolean {
  const allowed = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes("*") || allowed.includes(restaurantId);
}

// ─── La demande ──────────────────────────────────────────────────────────────

export type OrderLineIn = { articleId: string; qty: number; selection: Selection };
export type OrderRequest = { firstName: string; phone: string; lines: OrderLineIn[] };

export type RefusalCode =
  | "forme" | "prenom" | "telephone" | "trop_de_lignes" | "quantite" | "plat_inconnu" | "plat_indisponible"
  | "choix_invalide" | "plafond" | "ferme" | "limite" | "indisponible";

export type CheckedRequest = { ok: true; request: OrderRequest } | { ok: false; code: RefusalCode; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Un numéro de téléphone propre : chiffres, « + » au début ; 8 à 15 chiffres (norme E.164). */
export function cleanPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `${t.startsWith("+") ? "+" : ""}${digits}`;
}

/** Forme de la demande. Rien n'est cru : un prénom vide, un téléphone illisible, une quantité folle sont refusés avec une phrase qui dit quoi faire. */
export function checkRequest(raw: unknown): CheckedRequest {
  if (!isObj(raw)) return { ok: false, code: "forme", message: "Commande illisible. Recharge la page et réessaie." };
  const rawName = typeof raw.firstName === "string" ? raw.firstName.replace(/[<>\u0000-\u001f]/g, "").trim() : "";
  if (rawName === "") return { ok: false, code: "prenom", message: "Dis-nous ton prénom, pour que le restaurant t'appelle quand c'est prêt." };
  const firstName = cleanFirstName(rawName);
  const phone = cleanPhone(raw.phone);
  if (phone === null) return { ok: false, code: "telephone", message: "Ce numéro de téléphone n'est pas lisible. Exemple : 0470 12 34 56." };
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) return { ok: false, code: "forme", message: "Ta commande est vide." };
  if (raw.lines.length > MAX_LINES) return { ok: false, code: "trop_de_lignes", message: `Trop de plats d'un coup (${MAX_LINES} au plus). Appelle le restaurant.` };
  const lines: OrderLineIn[] = [];
  for (const l of raw.lines) {
    if (!isObj(l) || typeof l.articleId !== "string" || l.articleId === "") return { ok: false, code: "forme", message: "Un des plats de ta commande est illisible. Recharge la page." };
    const qty = l.qty;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return { ok: false, code: "quantite", message: `Une quantité doit être entre 1 et ${MAX_QTY}.` };
    }
    if (l.selection !== undefined && !isObj(l.selection)) return { ok: false, code: "forme", message: "Un des choix de ta commande est illisible. Recharge la page." };
    lines.push({ articleId: l.articleId, qty, selection: (l.selection ?? {}) as Selection });
  }
  return { ok: true, request: { firstName, phone, lines } };
}

// ─── Le prix : recalculé par le serveur ──────────────────────────────────────

export type CatalogItem = { id: string; name: string; price: number; active: boolean; zone: string | null };

/** Une ligne telle qu'elle est figée dans la commande (photo au moment de la commande). */
export type OrderLine = { articleId: string; name: string; qty: number; cents: number; zone: string | null; details: TicketLine["details"] };

export type PricedOrder =
  | { ok: true; lines: OrderLine[]; totalCents: number }
  | { ok: false; code: RefusalCode; message: string };

/**
 * Valide chaque ligne contre le catalogue ET l'arbre d'options du plat (minimum, maximum, quantités, choix indisponibles),
 * puis calcule le prix. Un plat sans option n'accepte AUCUN choix. Tout écart refuse la commande entière : jamais de
 * commande « à peu près ».
 */
export function priceOrder(request: OrderRequest, items: Map<string, CatalogItem>, trees: Map<string, OptionGroup[]>): PricedOrder {
  const lines: OrderLine[] = [];
  let total = 0;
  for (const l of request.lines) {
    const item = items.get(l.articleId);
    if (!item) return { ok: false, code: "plat_inconnu", message: "Un des plats de ta commande n'existe plus. Recharge la page." };
    if (!item.active) return { ok: false, code: "plat_indisponible", message: `« ${item.name} » n'est plus proposé. Retire-le de ta commande.` };
    const tree = trees.get(l.articleId) ?? [];
    const check = validateSelection(tree, l.selection);
    if (!check.ok) {
      return { ok: false, code: "choix_invalide", message: `Un choix manque ou est impossible pour « ${item.name} » : ${check.errors[0]?.message ?? "vérifie tes choix"}` };
    }
    const unit = priceCents(item.price, tree, l.selection);
    if (!Number.isFinite(unit) || unit < 0) return { ok: false, code: "choix_invalide", message: `Le prix de « ${item.name} » n'a pas pu être calculé. Appelle le restaurant.` };
    const cents = unit * l.qty;
    total += cents;
    lines.push({ articleId: item.id, name: item.name, qty: l.qty, cents, zone: cleanZone(item.zone), details: describeSelection(tree, l.selection) });
  }
  if (total > MAX_TOTAL_CENTS) return { ok: false, code: "plafond", message: "Cette commande est trop importante pour un retrait au comptoir. Appelle le restaurant." };
  return { ok: true, lines, totalCents: total };
}

/** Les lignes figées → les lignes d'un ticket (lib/menu-options/tickets.ts). */
export const toTicketLines = (lines: OrderLine[]): TicketLine[] =>
  lines.map((l) => ({ name: l.name, qty: l.qty, zone: l.zone, cents: l.cents, details: l.details }));

/** Relit les lignes figées d'une commande (JSONB) sans rien croire : une ligne illisible est ignorée, jamais fatale à l'écran. */
export function readLines(raw: unknown): OrderLine[] {
  if (!Array.isArray(raw)) return [];
  const out: OrderLine[] = [];
  for (const l of raw) {
    if (!isObj(l) || typeof l.name !== "string") continue;
    out.push({
      articleId: typeof l.articleId === "string" ? l.articleId : "",
      name: l.name.slice(0, 120),
      qty: typeof l.qty === "number" && l.qty >= 1 ? Math.floor(l.qty) : 1,
      cents: typeof l.cents === "number" && l.cents >= 0 ? Math.round(l.cents) : 0,
      zone: typeof l.zone === "string" ? l.zone.slice(0, MAX_ZONE) : null,
      details: Array.isArray(l.details) ? (l.details.filter((d) => isObj(d) && typeof d.name === "string" && typeof d.group === "string") as OrderLine["details"]) : [],
    });
  }
  return out;
}

// ─── La vie d'une commande ───────────────────────────────────────────────────

export type OrderStatus = "recue" | "prete" | "retiree" | "annulee";

export const STATUS_LABEL: Record<OrderStatus, string> = { recue: "Reçue", prete: "Prête", retiree: "Retirée", annulee: "Annulée" };

const NEXT: Record<OrderStatus, OrderStatus[]> = { recue: ["prete", "annulee"], prete: ["retiree", "annulee"], retiree: [], annulee: [] };

export const nextStatuses = (s: OrderStatus): OrderStatus[] => NEXT[s];
export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => NEXT[from].includes(to);
export const isOrderStatus = (v: unknown): v is OrderStatus => v === "recue" || v === "prete" || v === "retiree" || v === "annulee";
/** Une commande ouverte attend encore le restaurateur ou le client. */
export const isOpen = (s: OrderStatus): boolean => s === "recue" || s === "prete";

/** Le numéro tel qu'on l'imprime : « 0147 ». */
export const formatNumber = (n: number): string => String(Math.max(0, Math.floor(n))).padStart(4, "0");

/** Le délai entre l'envoi et « prête », en minutes entières ; `null` tant qu'elle n'est pas prête. Mesure du temps de préparation (ADR 0065). */
export function minutesToReady(createdAt: string, readyAt: string | null): number | null {
  if (!readyAt) return null;
  const ms = Date.parse(readyAt) - Date.parse(createdAt);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60000) : null;
}

/** La date du jour à Bruxelles (AAAA-MM-JJ) : le numéro de commande repart de 1 chaque jour, à l'heure du restaurant. */
export function brusselsDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
