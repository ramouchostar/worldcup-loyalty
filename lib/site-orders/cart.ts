// ADR 0099 §2 — le panier du client, côté navigateur. Logique PURE et testée, sans React ni réseau.
//
// Deux règles qui évitent qu'un panier soit refusé par le serveur (qui fait foi, lib/site-orders/order.ts) :
//  - la sélection envoyée ne contient QUE des groupes ouverts : un sous-groupe dont le choix a été décoché est retiré
//    (le serveur refuse tout chemin de groupe inconnu) ;
//  - les quantités respectent le maximum du choix et du groupe.
// Le prix affiché ici est un confort : le serveur le recalcule, et c'est lui qu'on croit.

import { defaultSelection, describeSelection, missingGroups, priceCents, validateSelection, visibleGroups } from "../menu-options/model";
import type { OptionGroup, Selection, SelectionLine } from "../menu-options/types";
import type { PublicItem, PublicMenu } from "./menu";
import { MAX_LINES, MAX_QTY } from "./order";

// ─── La sélection d'un plat ──────────────────────────────────────────────────

/** Ne garde que les groupes ouverts et les quantités positives : ce que le serveur accepte. */
export function pruneSelection(groups: OptionGroup[], selection: Selection): Selection {
  const out: Selection = {};
  for (const v of visibleGroups(groups, selection)) {
    const picked = selection[v.path] ?? {};
    const kept = Object.fromEntries(Object.entries(picked).filter(([, q]) => q > 0));
    out[v.path] = kept;
  }
  return out;
}

/** La sélection de départ d'un plat : les choix cochés d'office (les crudités), rien d'autre. */
export const startSelection = (groups: OptionGroup[]): Selection => pruneSelection(groups, defaultSelection(groups));

const total = (picked: Record<string, number> | undefined) => Object.values(picked ?? {}).reduce((a, b) => a + b, 0);

/**
 * Change la quantité d'un choix. Un groupe « un seul choix » (max 1) remplace l'ancien choix au lieu de refuser ;
 * un groupe à plusieurs choix refuse de dépasser son maximum (la sélection revient inchangée). Les sous-groupes que le
 * choix ouvre démarrent avec leurs choix cochés d'office ; ceux qu'il referme disparaissent.
 */
export function setChoiceQty(groups: OptionGroup[], selection: Selection, path: string, choiceId: string, qty: number): Selection {
  const group = visibleGroups(groups, selection).find((v) => v.path === path)?.group;
  const choice = group?.choices.find((c) => c.id === choiceId);
  if (!group || !choice || !choice.isAvailable) return selection;
  const next: Selection = JSON.parse(JSON.stringify(selection));
  const q = Math.max(0, Math.min(choice.maxQty, Math.floor(qty)));
  const picked = (next[path] = next[path] ?? {});
  if (q === 0) delete picked[choiceId];
  else {
    if (group.max === 1) for (const k of Object.keys(picked)) delete picked[k];
    picked[choiceId] = q;
    if (group.max !== null && total(picked) > group.max) return selection;
  }
  // Un sous-groupe qui vient de s'ouvrir démarre avec ses choix cochés d'office.
  const opened = new Set(Object.keys(selection));
  const withDefaults: Selection = { ...next };
  for (const v of visibleGroups(groups, next)) {
    if (opened.has(v.path)) continue;
    withDefaults[v.path] = Object.fromEntries(v.group.choices.filter((c) => c.isDefault && c.isAvailable).map((c) => [c.id, 1]));
  }
  return pruneSelection(groups, withDefaults);
}

export type SelectionState = { ok: boolean; missing: string[]; message: string | null };

/** Le plat peut-il être ajouté ? Sinon, quel groupe manque, dans une phrase qu'on peut montrer au client. */
export function selectionState(groups: OptionGroup[], selection: Selection): SelectionState {
  const missing = missingGroups(groups, selection);
  const check = validateSelection(groups, selection);
  if (check.ok) return { ok: true, missing: [], message: null };
  return { ok: false, missing, message: check.errors[0]?.message ?? "Vérifie tes choix." };
}

export const unitCents = (item: PublicItem, selection: Selection): number => priceCents(item.priceCents / 100, item.groups, selection);

// ─── Le panier ───────────────────────────────────────────────────────────────

export type CartLine = {
  key: string;
  articleId: string;
  name: string;
  qty: number;
  /** Prix d'UN exemplaire, choix compris, en centimes. */
  unitCents: number;
  selection: Selection;
  /** Ce que le client a choisi, lisible (« Samouraï », « SANS SALADE »). */
  details: SelectionLine[];
};
export type Cart = CartLine[];

/** Une clé stable : deux plats identiques aux mêmes choix se regroupent, quel que soit l'ordre des clés. */
export function lineKey(articleId: string, selection: Selection): string {
  const sorted = Object.keys(selection).sort().map((p) => [p, Object.entries(selection[p]).sort(([a], [b]) => a.localeCompare(b))]);
  return `${articleId}|${JSON.stringify(sorted)}`;
}

/** Ajoute un plat. Quantité plafonnée (comme le serveur) ; le panier est plafonné en nombre de lignes. */
export function addToCart(cart: Cart, item: PublicItem, selection: Selection, qty = 1): Cart {
  const pruned = pruneSelection(item.groups, selection);
  const key = lineKey(item.id, pruned);
  const existing = cart.find((l) => l.key === key);
  if (existing) return cart.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l));
  if (cart.length >= MAX_LINES) return cart;
  return [...cart, {
    key, articleId: item.id, name: item.name, qty: Math.min(MAX_QTY, Math.max(1, qty)), unitCents: unitCents(item, pruned),
    selection: pruned, details: describeSelection(item.groups, pruned),
  }];
}

export const setLineQty = (cart: Cart, key: string, qty: number): Cart =>
  qty <= 0 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, Math.floor(qty)) } : l));

export const removeLine = (cart: Cart, key: string): Cart => cart.filter((l) => l.key !== key);
export const cartTotal = (cart: Cart): number => cart.reduce((n, l) => n + l.unitCents * l.qty, 0);
export const cartCount = (cart: Cart): number => cart.reduce((n, l) => n + l.qty, 0);

/** Ce qui part au serveur : des identifiants, des quantités et des choix. JAMAIS un prix ni un nom. */
export const toOrderLines = (cart: Cart): { articleId: string; qty: number; selection: Selection }[] =>
  cart.map((l) => ({ articleId: l.articleId, qty: l.qty, selection: l.selection }));

// ─── Le panier qui attend la connexion (ADR 0108 §2) ─────────────────────────

/** Ce qui attend dans le navigateur pendant que le client se connecte : des identifiants, des quantités, des choix. Jamais un prix ni un nom. */
export type SavedCart = { savedAt: number; lines: { articleId: string; qty: number; selection: Selection }[] };

/** Un panier de plus de deux heures n'est plus celui du client : on ne le retrouve pas (même durée que le cookie de retour). */
export const SAVED_CART_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export const saveCart = (cart: Cart, now: number = Date.now()): SavedCart => ({ savedAt: now, lines: toOrderLines(cart) });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Une sélection lue du navigateur : rien n'est cru, seules les quantités entières positives passent. */
function readSelection(raw: unknown): Selection | null {
  if (raw === undefined) return {};
  if (!isRecord(raw)) return null;
  const out: Selection = {};
  for (const [path, picked] of Object.entries(raw)) {
    if (!isRecord(picked)) return null;
    out[path] = Object.fromEntries(Object.entries(picked).filter(([, q]) => typeof q === "number" && Number.isInteger(q) && q > 0)) as Record<string, number>;
  }
  return out;
}

/**
 * Relit un panier sauvé et le RECONSTRUIT à partir de la carte d'aujourd'hui : le nom, le prix et les choix lisibles sont ceux
 * de la carte, jamais ceux qui dormaient dans le navigateur. Un plat qui n'est plus proposé, ou dont les choix ne sont plus
 * valables, est écarté et COMPTÉ (`dropped`) pour que la page le dise : jamais un plat qui disparaît sans un mot.
 */
export function restoreCart(raw: unknown, menu: PublicMenu, now: number = Date.now()): { cart: Cart; dropped: number } {
  const empty = { cart: [] as Cart, dropped: 0 };
  if (!isRecord(raw) || typeof raw.savedAt !== "number" || !Array.isArray(raw.lines)) return empty;
  if (now - raw.savedAt > SAVED_CART_MAX_AGE_MS || raw.savedAt > now + 60_000) return empty;
  const items = new Map(menu.categories.flatMap((c) => c.items).map((it) => [it.id, it] as const));
  let cart: Cart = [];
  let dropped = 0;
  for (const l of raw.lines.slice(0, MAX_LINES)) {
    if (!isRecord(l) || typeof l.articleId !== "string" || typeof l.qty !== "number" || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) { dropped++; continue; }
    const item = items.get(l.articleId);
    const selection = readSelection(l.selection);
    if (!item || selection === null) { dropped++; continue; }
    const pruned = pruneSelection(item.groups, selection);
    if (!selectionState(item.groups, pruned).ok) { dropped++; continue; }
    cart = addToCart(cart, item, pruned, l.qty);
  }
  return { cart, dropped };
}

export const euro = (cents: number): string => (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
