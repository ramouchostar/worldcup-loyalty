import { test } from "node:test";
import assert from "node:assert/strict";
import { teamTiersToAward, type TeamTier } from "./team-gift-rules";

const TIERS: TeamTier[] = [
  { id: "t3", min: 6000, item: "Chef's Combo", cost: 1.92 },
  { id: "t1", min: 1000, item: "Churros (6)", cost: 0.31 },
  { id: "t2", min: 3000, item: "Hot stripes (16)", cost: 2.39 },
];
// Campus Alma à Kraainem (2026-09-18) : 8 membres, 195 € de dépense cumulée
const alma = { memberCount: 8, teamTotalSpent: 195, budgetPct: 0.08 };

test("aucun palier franchi : rien à attribuer", () => {
  assert.deepEqual(teamTiersToAward(125, TIERS, [], alma), { toAward: [], waitingForCoverage: [] });
});

test("palier franchi et financé : attribué, dans l'ordre des seuils", () => {
  const d = teamTiersToAward(3200, TIERS, [], { ...alma, teamTotalSpent: 400 });
  assert.deepEqual(d.toAward.map((t) => t.id), ["t1", "t2"]);
  assert.deepEqual(d.waitingForCoverage, []);
});

test("un palier déjà attribué ne l'est jamais deux fois", () => {
  const d = teamTiersToAward(3200, TIERS, ["t1"], { ...alma, teamTotalSpent: 400 });
  assert.deepEqual(d.toAward.map((t) => t.id), ["t2"]);
});

test("palier franchi mais pas encore financé : il attend, il n'est pas perdu", () => {
  // 8 × 2,39 € = 19,12 € > 195 € × 8 % = 15,60 €
  const d = teamTiersToAward(3200, TIERS, ["t1"], alma);
  assert.deepEqual(d.toAward, []);
  assert.deepEqual(d.waitingForCoverage.map((t) => t.id), ["t2"]);
});

test("le seuil est inclusif", () => {
  assert.deepEqual(teamTiersToAward(1000, TIERS, [], alma).toAward.map((t) => t.id), ["t1"]);
});
