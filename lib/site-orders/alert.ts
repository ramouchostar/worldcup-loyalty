// ADR 0099 §7 et §10 — l'alerte d'une nouvelle commande du site, dans la console. Sans imprimante, une commande n'est vue que
// si le restaurateur regarde son écran : le son est ce qui remplace le papier qui sort. Logique PURE et testée ; le son
// lui-même (Web Audio) et la veille d'écran vivent dans le composant, car ils exigent un navigateur.
//
// Règles :
//  - une commande qui est DÉJÀ là quand on ouvre la page ne sonne pas (il vient de la regarder), mais elle reste à l'écran ;
//  - une nouvelle commande « reçue » sonne tout de suite, puis se rappelle toutes les 30 secondes, 10 fois au plus (5 minutes),
//    tant que le restaurateur n'a pas touché « J'ai vu » : un son sans fin finit coupé, un son qui s'arrête seul est raté ;
//  - passer une commande à « prête » ou l'annuler suffit à l'acquitter ; « J'ai vu » acquitte tout ce qui sonne ;
//  - le bandeau reste jusqu'à l'acquittement, même une fois le son arrêté : le son s'arrête, l'alerte non.

import type { OrderView } from "./service";

export const REPEAT_MS = 30_000;
export const MAX_REPEATS = 10;

export type AlertState = {
  /** Les commandes déjà vues par cette page ; `null` = première lecture pas encore faite (rien ne sonne). */
  seen: ReadonlySet<string> | null;
  /** Les nouvelles commandes que personne n'a encore acquittées. */
  waiting: readonly string[];
  /** Combien de fois on a sonné pour l'alerte en cours (rappels compris). */
  rings: number;
  lastRingAt: number | null;
};

export const initialAlert = (): AlertState => ({ seen: null, waiting: [], rings: 0, lastRingAt: null });

export type AlertStep = { state: AlertState; ring: boolean; fresh: readonly OrderView[] };

/** Fait avancer l'alerte avec la dernière lecture des commandes. `now` en millisecondes. */
export function stepAlert(state: AlertState, orders: readonly OrderView[], now: number): AlertStep {
  const ids = new Set(orders.map((o) => o.id));
  if (state.seen === null) return { state: { seen: ids, waiting: [], rings: 0, lastRingAt: null }, ring: false, fresh: [] };

  const open = new Set(orders.filter((o) => o.status === "recue").map((o) => o.id));
  const fresh = orders.filter((o) => o.status === "recue" && !state.seen!.has(o.id));
  // Une commande préparée, annulée ou disparue n'a plus besoin d'être acquittée.
  const waiting = [...state.waiting.filter((id) => open.has(id)), ...fresh.map((o) => o.id)];
  const seen = new Set([...state.seen, ...ids]);

  if (waiting.length === 0) return { state: { seen, waiting: [], rings: 0, lastRingAt: null }, ring: false, fresh };
  if (fresh.length > 0) return { state: { seen, waiting, rings: 1, lastRingAt: now }, ring: true, fresh };

  const due = state.lastRingAt !== null && now - state.lastRingAt >= REPEAT_MS && state.rings < MAX_REPEATS;
  return due
    ? { state: { seen, waiting, rings: state.rings + 1, lastRingAt: now }, ring: true, fresh }
    : { state: { seen, waiting, rings: state.rings, lastRingAt: state.lastRingAt }, ring: false, fresh };
}

/** « J'ai vu » : l'alerte s'éteint ; les commandes restent vues, elles ne sonneront plus. */
export const acknowledge = (state: AlertState): AlertState => ({ ...state, waiting: [], rings: 0, lastRingAt: null });

/** Le son s'est arrêté seul (10 rappels) alors que des commandes attendent : le bandeau le dit. */
export const gaveUp = (state: AlertState): boolean => state.waiting.length > 0 && state.rings >= MAX_REPEATS;

/** Le titre de l'onglet : on le voit même quand la page est derrière une autre. */
export const alertTitle = (waiting: number, base = "Commandes du site"): string =>
  waiting > 0 ? `(${waiting}) ${waiting > 1 ? "Nouvelles commandes" : "Nouvelle commande"} · ${base}` : base;
