// ============================================================
// Les cadeaux se choisissent avec ses points (ADR 0061).
//
// Pur, sans dépendance serveur : partagé par les écrans membre (catalogue,
// écran de succès, carte de gain, accueil) et l'écran Menu du restaurateur.
//
// ⚠️ Miroir des fonctions SQL `personal_points_for_order` et
// `catalog_price_points` (migration 20260918-0420). L'AUTORITÉ est SQL : le
// débit réel se fait dans `exchange_points_for_item`, qui recalcule le prix.
// ============================================================

/**
 * Points personnels par euro du ticket (ADR 0061 §1). Proportionnels, pas
 * courbés : les 8 % tiennent pour chaque client, quel que soit son ticket.
 * Jamais affiché ; les points ne se convertissent pas en euros.
 */
export const PERSONAL_POINTS_PER_EURO = 10;

/** Part des dépenses rendue en cadeaux (ADR 0012 / 0017). */
export const CATALOGUE_BUDGET_PCT = 0.08;

/** Points personnels d'un ticket, depuis le montant lu par le serveur. */
export function personalPointsForOrder(amountEur: number): number {
  const amount = Number(amountEur);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * PERSONAL_POINTS_PER_EURO);
}

/**
 * Prix en points d'un article : arrondi au 5 supérieur de
 * prix de revient ÷ taux budget × points par euro. `null` hors catalogue
 * (coût inconnu ou nul). Arrondi vers le haut : le coût ne dépasse jamais la
 * part budget des dépenses qui ont produit les points.
 */
export function catalogPricePoints(costEur: number | null | undefined, budgetPct = CATALOGUE_BUDGET_PCT): number | null {
  const cost = Number(costEur);
  if (costEur == null || !Number.isFinite(cost) || cost <= 0) return null;
  const pct = budgetPct > 0 ? budgetPct : CATALOGUE_BUDGET_PCT;
  // En centimes et au millionième : 0,25 / 0,08 ne doit pas devenir 3,1249999.
  const raw = Number(((cost * PERSONAL_POINTS_PER_EURO) / pct / 5).toFixed(6));
  return Math.ceil(raw) * 5;
}

/** Un article du catalogue tel que le membre le voit : jamais de coût. */
export type CatalogueItem = {
  id: string;
  name: string;
  imagePath: string | null;
  pricePoints: number;
};

export type CatalogueView = {
  /** L'article le plus généreux déjà à portée, ou null. */
  reachable: CatalogueItem | null;
  /** Le premier article hors de portée, ou null s'ils le sont tous. */
  next: CatalogueItem | null;
  /** Points qui manquent pour `next` (0 sans `next`). */
  missing: number;
  /** Proportion du solde vers `next` (0-100), pour une barre ; 100 sans `next`. */
  pct: number;
};

/**
 * Ce qu'un solde permet (ADR 0061 §5) : « tu peux déjà avoir X » et/ou
 * « plus que N points pour Y ». À prix égal, l'ordre du catalogue départage.
 */
export function catalogueView(balance: number, items: CatalogueItem[]): CatalogueView {
  const safe = Math.max(0, Math.floor(Number(balance) || 0));
  const sorted = [...items]
    .filter((i) => Number.isFinite(i.pricePoints) && i.pricePoints > 0)
    .sort((a, b) => a.pricePoints - b.pricePoints);
  const affordable = sorted.filter((i) => i.pricePoints <= safe);
  const reachable = affordable.length ? affordable[affordable.length - 1] : null;
  const next = sorted.find((i) => i.pricePoints > safe) ?? null;
  const missing = next ? next.pricePoints - safe : 0;
  const pct = next ? Math.max(0, Math.min(100, Math.round((safe / next.pricePoints) * 100))) : 100;
  return { reachable, next, missing, pct };
}
