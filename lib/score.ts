// Score communautaire = membres × euros validés (ADR 0014 : plus de bonus ×1.5).
export function calculateScore(memberCount: number, totalSpent: number): number {
  return memberCount * totalSpent;
}
