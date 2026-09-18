// ============================================================
// Écran d'accueil membre (ADR 0059) — logique pure, testable sans base.
//
// L'accueil répond à trois questions, dans l'ordre : qu'est-ce que j'ai (un
// cadeau qui attend), qu'est-ce que je peux viser (« Mes points », ADR 0061),
// qu'est-ce que je fais (la photo). Ces fonctions ne décident que
// de ce qui s'affiche ; aucun seuil en euros ne sort d'ici (ADR 0007/0028).
// ============================================================

/**
 * Pastille d'état du bandeau, visible sur tous les écrans (ADR 0059 §3) :
 * ce qui appelle une action. Le cadeau qui attend passe avant tout ; sinon
 * le solde « Mes points » (ADR 0061), là où le catalogue propose au moins un
 * article — sans rien à choisir, un solde n'appelle aucune action. `null` :
 * rien à signaler, seule la pastille des jetons reste.
 */
export type HeaderStatus = { kind: "gift" } | { kind: "points"; balance: number } | null;

export function headerStatus(input: {
  hasGift: boolean;
  pointsBalance: number;
  catalogueSize: number;
}): HeaderStatus {
  if (input.hasGift) return { kind: "gift" };
  if (input.catalogueSize > 0) return { kind: "points", balance: Math.max(0, input.pointsBalance) };
  return null;
}
