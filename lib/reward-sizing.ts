// ADR 0017 — Dimensionnement des récompenses par les coûts de revient.
// Principe : le coût réel d'un cadeau doit être couvert par le budget cadeaux
// (REWARD_BUDGET_PCT, défaut 8 %) des dépenses qui l'ont déclenché.
// Fonctions pures, sans dépendance serveur — importables côté client, mais les
// VALEURS en euros qu'on leur passe restent service-role (ADR 0007).

export const DEFAULT_BUDGET_PCT = 0.08;

// Panier moyen par défaut quand l'établissement n'a aucune commande validée
// (même valeur que le fallback du hero dashboard, ADR 0010).
export const DEFAULT_AVG_BASKET = 25;

// Multiplicateurs des 4 paliers solo, calibrés sur la grille historique
// Belchicken : panier ~€17,6 → 15 / 25 / 40 / 60.
const SOLO_BAND_MULTIPLIERS = [1, 5 / 3, 8 / 3, 4] as const;

const roundTo5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

// ─── Règle 1 — paliers solo ──────────────────────────────────────────────────

// Coût maximal d'un cadeau assigné à un palier solo de seuil `threshold` €.
export function soloCostCap(threshold: number, pct: number = DEFAULT_BUDGET_PCT): number {
  return threshold * pct;
}

// Paliers solo dimensionnés pour l'établissement : base = max(85 % du panier
// moyen, plus petit seuil finançant le cadeau le moins cher), arrondie aux €5,
// puis multiplicateurs historiques.
export function suggestSoloBands(
  avgBasket: number,
  cheapestGiftCost: number,
  pct: number = DEFAULT_BUDGET_PCT
): number[] {
  const safeBasket = avgBasket > 0 ? avgBasket : DEFAULT_AVG_BASKET;
  const minForCheapest = cheapestGiftCost > 0 ? cheapestGiftCost / pct : 0;
  const base = roundTo5(Math.max(0.85 * safeBasket, minForCheapest));
  const bands = SOLO_BAND_MULTIPLIERS.map((m) => roundTo5(base * m));
  // Multiplicateurs + arrondi garantissent la croissance stricte sauf base
  // minuscule — dédoublonnage défensif.
  return bands.filter((b, i) => i === 0 || b > bands[i - 1]);
}

// ─── Règle 2 — cadeau à coût pur (jetons) ────────────────────────────────────

export type GiftCandidate = {
  id: string;
  name: string;
  menu_price: number;
  cost_price: number;
};

// Plafond de coût d'un cadeau sans commande en face : on le finance comme
// s'il déclenchait une commande moyenne.
export function jetonsGiftCostCap(avgBasket: number, pct: number = DEFAULT_BUDGET_PCT): number {
  return (avgBasket > 0 ? avgBasket : DEFAULT_AVG_BASKET) * pct;
}

// Meilleur cadeau sous plafond : ratio valeur perçue / coût réel maximal,
// à ratio égal le coût le plus faible. Null si rien ne passe sous le plafond.
export function pickBestGift(items: GiftCandidate[], costCap: number): GiftCandidate | null {
  let best: GiftCandidate | null = null;
  let bestRatio = -1;
  for (const it of items) {
    if (it.cost_price <= 0 || it.cost_price > costCap) continue;
    const ratio = it.menu_price / it.cost_price;
    if (ratio > bestRatio || (ratio === bestRatio && best !== null && it.cost_price < best.cost_price)) {
      best = it;
      bestRatio = ratio;
    }
  }
  return best;
}

// Cadeau le plus généreux sous plafond : valeur perçue (prix carte) maximale,
// à valeur égale le coût le plus faible. Pour les paliers élevés d'une
// configuration par défaut — le plafond monte avec le palier, l'article suit.
export function pickGenerousGift(items: GiftCandidate[], costCap: number): GiftCandidate | null {
  let best: GiftCandidate | null = null;
  for (const it of items) {
    if (it.cost_price <= 0 || it.cost_price > costCap) continue;
    if (
      !best ||
      it.menu_price > best.menu_price ||
      (it.menu_price === best.menu_price && it.cost_price < best.cost_price)
    ) {
      best = it;
    }
  }
  return best;
}

// ─── Règle 3 — couverture communautaire ──────────────────────────────────────

export type TeamCoverage = {
  memberCount: number;
  teamTotalSpent: number;
  budgetPct: number;
};

// Un cadeau distribué à toute l'équipe n'est couvert que si la marge budget
// sur la dépense cumulée de l'équipe finance une distribution complète.
export function coverageSatisfied(coverage: TeamCoverage, giftCost: number): boolean {
  if (giftCost <= 0) return true; // pourcentage / pas de coût matière
  if (coverage.memberCount <= 0) return true;
  return coverage.memberCount * giftCost <= coverage.teamTotalSpent * coverage.budgetPct;
}

// Dépense cumulée qu'une équipe doit atteindre pour couvrir un cadeau —
// affichage admin uniquement (euros, ADR 0007).
export function requiredTeamSpend(
  memberCount: number,
  giftCost: number,
  pct: number = DEFAULT_BUDGET_PCT
): number {
  if (giftCost <= 0 || memberCount <= 0) return 0;
  return (memberCount * giftCost) / pct;
}
