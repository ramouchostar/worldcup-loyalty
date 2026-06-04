export function calculateScore(memberCount: number, totalSpent: number): number {
  return memberCount * totalSpent;
}

// x1.5 bonus for 48h after a team passes a round
export function calculateScoreWithBonus(
  memberCount: number,
  totalSpent: number,
  passedRound: boolean,
  hoursElapsed: number
): number {
  const base = memberCount * totalSpent;
  if (passedRound && hoursElapsed < 48) {
    return base * 1.5;
  }
  return base;
}

// Apply round-advancement bonus to a precomputed score.
// Uses round_advanced_at to determine whether the 48h window is still open.
// round_advanced_at is never returned to the client — only used server-side.
export function applyRoundBonus(baseScore: number, roundAdvancedAt: string | null): number {
  if (!roundAdvancedAt) return baseScore;
  const hoursElapsed = (Date.now() - new Date(roundAdvancedAt).getTime()) / 3_600_000;
  return hoursElapsed < 48 ? baseScore * 1.5 : baseScore;
}
