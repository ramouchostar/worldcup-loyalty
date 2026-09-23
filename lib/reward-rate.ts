// ============================================================
// Le taux cadeaux, choisi par le restaurateur (ADR 0068).
//
// Le taux est la part de ses encaissements qu'un établissement rend en
// cadeaux. Il pilote tout (ADR 0061 amendé) : prix du catalogue, plafond du
// mois, couverture des cadeaux d'équipe, plafonds de paliers.
//
// Ce module traduit un pourcentage en deux langues que le restaurateur
// comprend, et qu'on sait calculer honnêtement :
//   1. la VITESSE : combien de tickets moyens pour tel cadeau ;
//   2. le COÛT : combien d'euros au plus sur le mois en cours.
// On ne promet JAMAIS un gain d'acquisition : rien dans nos données ne
// relie un taux à un nombre de clients (bouclier ADR 0065).
//
// Pur, sans dépendance serveur.
// ============================================================

import { catalogPricePoints, personalPointsForOrder } from "./catalogue";

/** Bornes du choix (décision du porteur, 2026-09-23). */
export const REWARD_RATE_MIN = 0.04;
export const REWARD_RATE_MAX = 0.12;
export const REWARD_RATE_STEP = 0.01;

export function rateOptions(): number[] {
  const out: number[] = [];
  for (let pct = REWARD_RATE_MIN; pct <= REWARD_RATE_MAX + 1e-9; pct += REWARD_RATE_STEP) {
    out.push(Math.round(pct * 100) / 100);
  }
  return out;
}

export function isValidRate(pct: number): boolean {
  return Number.isFinite(pct) && pct >= REWARD_RATE_MIN - 1e-9 && pct <= REWARD_RATE_MAX + 1e-9;
}

export type RatePreviewItem = {
  name: string;
  /** Prix en points à ce taux. */
  pricePoints: number;
  /** Nombre de tickets moyens pour l'obtenir (arrondi au supérieur). */
  tickets: number;
};

export type RatePreview = {
  pct: number;
  /** Ce que le mois en cours autoriserait au plus, en euros. */
  monthlyCeiling: number;
  items: RatePreviewItem[];
};

/**
 * Ce que ce taux donne, avec les vrais chiffres de l'établissement : son
 * panier moyen, ses articles, son chiffre d'affaires programme du mois.
 */
export function previewRate(input: {
  pct: number;
  avgBasket: number;
  monthlyProgramRevenue: number;
  items: { name: string; costPrice: number }[];
}): RatePreview {
  const ticketPoints = personalPointsForOrder(input.avgBasket);
  const items: RatePreviewItem[] = [];
  for (const item of input.items) {
    const price = catalogPricePoints(item.costPrice, input.pct);
    if (price == null) continue;
    items.push({
      name: item.name,
      pricePoints: price,
      tickets: ticketPoints > 0 ? Math.ceil(price / ticketPoints) : 0,
    });
  }
  return {
    pct: input.pct,
    monthlyCeiling: Math.round(input.monthlyProgramRevenue * input.pct),
    items,
  };
}

/**
 * De combien les soldes des clients doivent bouger quand le taux change
 * (décision du porteur) : à 4 % un cadeau coûte deux fois plus de points
 * qu'à 8 %, donc les soldes doublent — personne ne perd ce qu'il a gagné.
 * 1 = rien à faire.
 */
export function balanceMultiplier(oldPct: number, newPct: number): number {
  if (!(oldPct > 0) || !(newPct > 0)) return 1;
  return oldPct / newPct;
}

/** Trois repères parlants : le plus accessible, un milieu, le plus généreux. */
export function pickReferenceItems<T extends { name: string; costPrice: number }>(items: T[], max = 3): T[] {
  const sorted = [...items].filter((i) => i.costPrice > 0).sort((a, b) => a.costPrice - b.costPrice);
  if (sorted.length <= max) return sorted;
  return [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted[sorted.length - 1]];
}
