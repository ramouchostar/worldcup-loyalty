// ============================================================
// Écran d'accueil membre (ADR 0059) — logique pure, testable sans base.
//
// L'accueil répond à trois questions, dans l'ordre : qu'est-ce que j'ai (un
// cadeau qui attend), qu'est-ce que je peux viser (le prochain ticket, la
// réserve), qu'est-ce que je fais (la photo). Ces fonctions ne décident que
// de ce qui s'affiche ; aucun seuil en euros ne sort d'ici (ADR 0007/0028).
// ============================================================

import type { GridTier } from "@/lib/rewards";

/**
 * Les cadeaux qu'un prochain ticket peut rapporter (couche 1, ADR 0006) :
 * noms distincts de la grille solo, du plus accessible au plus généreux,
 * jamais de seuil. Au-delà de `max`, on garde l'éventail — le premier, celui
 * du milieu, le dernier — plutôt que les plus petits cadeaux.
 */
export function ticketPromiseItems(solo: GridTier[], max = 3): string[] {
  const names: string[] = [];
  for (const tier of [...solo].sort((a, b) => a.min - b.min)) {
    if (!names.includes(tier.item)) names.push(tier.item);
  }
  if (names.length <= max) return names;
  if (max <= 1) return names.slice(0, max);
  if (max === 2) return [names[0], names[names.length - 1]];
  return [names[0], names[Math.floor((names.length - 1) / 2)], names[names.length - 1]];
}

/** Gros cadeau de la réserve (ADR 0021) — seuil en points de réserve. */
export type SaverTier = { id: string; min_threshold: number; item_name: string };

export type ReserveView = {
  balance: number;
  /** Le plus gros cadeau déjà atteignable avec le solde, ou null. */
  reachable: SaverTier | null;
  /** Le premier cadeau au-dessus du solde, ou null s'ils sont tous atteints. */
  next: SaverTier | null;
  /** Proportion du solde vers `next` (0-100), pour une barre. 100 sans `next`. */
  pct: number;
};

export function reserveView(balance: number, tiers: SaverTier[]): ReserveView {
  const sorted = [...tiers].sort((a, b) => a.min_threshold - b.min_threshold);
  const safeBalance = Math.max(0, balance);
  const reachable = sorted.filter((t) => t.min_threshold <= safeBalance).pop() ?? null;
  const next = sorted.find((t) => t.min_threshold > safeBalance) ?? null;
  const pct = next
    ? Math.max(0, Math.min(100, Math.round((safeBalance / next.min_threshold) * 100)))
    : 100;
  return { balance: safeBalance, reachable, next, pct };
}
