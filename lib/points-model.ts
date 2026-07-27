// ============================================================
// Modèle de points client (ADR 0028) — DÉCOUPLÉ de l'euro, non-dérivable.
//
// Formule non-linéaire :  pts = round(BASE + SCALE × montant^α),  0 < α < 1.
//   • BASE   : bonus de visite (récompense la FRÉQUENCE, indépendant du montant)
//   • ^α     : composante dépense CONCAVE → pas de taux €→pts constant
//              (un ticket de €50 ne rapporte pas 2× un ticket de €25)
//   • SCALE  : facteur d'échelle (par resto à terme ; défaut global en v1)
//
// Équilibre (b) : à un panier typique (~€25), BASE et la composante dépense
// pèsent de façon comparable → la fréquence ET la dépense comptent.
//
// ⚠️ DOIT rester synchronisé avec la fonction SQL `points_for_order` (m47) :
// même formule, mêmes constantes. L'AUTORITÉ de calcul du score d'équipe est
// SQL (trigger) ; ce module sert l'affichage / la prévisualisation côté membre.
//
// Repères (BASE=20, SCALE=4, α=0.6) :
//   €10 → 36 pts · €25 → 48 · €50 → 62 · €100 → 83
//   taux €→pts : 3.6 / 1.9 / 1.24 / 0.83 → VARIABLE ⇒ non-inversible.
// ============================================================

export const POINTS_BASE = 20;
export const POINTS_SCALE = 4;
export const POINTS_ALPHA = 0.6;

export type PointsParams = { base?: number; scale?: number; alpha?: number };

/** Points gagnés pour une commande d'un montant donné (euros → points courbés). */
export function pointsForOrder(amountEur: number, params: PointsParams = {}): number {
  const base = params.base ?? POINTS_BASE;
  const scale = params.scale ?? POINTS_SCALE;
  const alpha = params.alpha ?? POINTS_ALPHA;
  const a = Math.max(0, Number(amountEur) || 0);
  return Math.round(base + scale * Math.pow(a, alpha));
}
