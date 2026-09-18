// ============================================================
// Cadeau d'équipe par palier franchi (ADR 0061 §7) — la règle, pure et testée.
//
// Quand une équipe franchit un palier (score en points d'équipe ≥ seuil),
// chaque membre reçoit UNE fois le cadeau que le restaurateur a choisi pour
// ce palier. Le but : une promotion financée parce que l'argent est déjà
// rentré, qui fait découvrir la carte — et un message à envoyer à ce segment.
//
// Un palier n'est attribué que si la dépense cumulée de l'équipe le finance
// (couverture ADR 0017 : membres × coût ≤ dépense × budget). Sinon il attend :
// il sera attribué quand l'équipe aura dépensé assez, jamais perdu.
// ============================================================

import { coverageSatisfied, type TeamCoverage } from "./reward-sizing";

export type TeamTier = { id: string; min: number; item: string; cost: number };

export type TeamTierDecision = {
  /** Paliers franchis, pas encore attribués, finançables maintenant. */
  toAward: TeamTier[];
  /** Paliers franchis, pas encore attribués, en attente de financement. */
  waitingForCoverage: TeamTier[];
};

export function teamTiersToAward(
  score: number,
  tiers: TeamTier[],
  awardedTierIds: Iterable<string>,
  coverage: TeamCoverage
): TeamTierDecision {
  const awarded = new Set(awardedTierIds);
  const crossed = [...tiers]
    .filter((t) => Number.isFinite(t.min) && Number(score) >= t.min && !awarded.has(t.id))
    .sort((a, b) => a.min - b.min);
  const toAward: TeamTier[] = [];
  const waitingForCoverage: TeamTier[] = [];
  for (const tier of crossed) {
    (coverageSatisfied(coverage, tier.cost) ? toAward : waitingForCoverage).push(tier);
  }
  return { toAward, waitingForCoverage };
}
