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
