// ============================================================
// Gros cadeaux de la réserve dans l'écran Menu du restaurateur (ADR 0060).
//
// Logique pure, testable sans base — importable côté client : la console a
// droit aux euros (ADR 0007 ne vise que le membre), mais le panier moyen lui
// arrive du serveur.
//
// Les seuils ne se saisissent pas : ceux déjà enregistrés s'affichent, sinon
// ceux calculés (≈ 4, 8, 12 tickets moyens). Le restaurateur choisit
// seulement l'article de chaque gros cadeau, sous son plafond de coût.
// ============================================================

import {
  DEFAULT_AVG_BASKET,
  DEFAULT_BUDGET_PCT,
  pickGenerousGift,
  saverCostCap,
  suggestSaverBands,
  type GiftCandidate,
} from "./reward-sizing";
import { pointsForOrder } from "./points-model";

/** Seuils à afficher : les seuils actifs enregistrés, sinon ceux calculés. */
export function saverBandsFor(savedActive: number[], avgBasket: number): number[] {
  const saved = Array.from(new Set(savedActive.map(Number).filter((n) => n > 0))).sort((a, b) => a - b);
  return saved.length > 0 ? saved : suggestSaverBands(avgBasket);
}

export type SaverBandView = {
  threshold: number;
  /** Nombre de tickets moyens que le seuil représente (arrondi). */
  tickets: number;
  /** Coût maximal de l'article, en euros (ADR 0017). */
  costCap: number;
};

export function saverBandView(
  threshold: number,
  avgBasket: number,
  pct: number = DEFAULT_BUDGET_PCT
): SaverBandView {
  const perTicket = pointsForOrder(avgBasket > 0 ? avgBasket : DEFAULT_AVG_BASKET);
  return {
    threshold,
    tickets: perTicket > 0 ? Math.max(1, Math.round(threshold / perTicket)) : 0,
    costCap: saverCostCap(threshold, avgBasket, pct),
  };
}

/** Un article peut-il être assigné à ce gros cadeau ? Coût connu et sous le plafond. */
export function fitsSaverCap(item: { cost_price: number | null }, costCap: number): boolean {
  return item.cost_price != null && Number(item.cost_price) > 0 && Number(item.cost_price) <= costCap;
}

/**
 * Suggestion déterministe (même règle que la génération par défaut et la
 * migration) : pour chaque gros cadeau, l'article le plus généreux (prix
 * carte) sous son plafond, à prix égal le moins coûteux.
 */
export function suggestSaverGifts(
  bands: number[],
  candidates: GiftCandidate[],
  avgBasket: number,
  pct: number = DEFAULT_BUDGET_PCT
): { threshold: number; item: GiftCandidate | null; costCap: number }[] {
  return bands.map((threshold) => {
    const costCap = saverCostCap(threshold, avgBasket, pct);
    return { threshold, item: pickGenerousGift(candidates, costCap), costCap };
  });
}
