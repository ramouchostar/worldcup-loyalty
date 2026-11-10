import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAll, GENERATORS, type Generator } from "./run";
import type { Idea } from "./types";

const idea = (type: string): Idea => ({
  assistant: "hugo",
  type,
  title: "t",
  question: "q",
  lines: { what: "w", who: "w", cost: "c" },
  estimate: null,
  decideBy: "2026-11-10",
  action: { kind: "open", path: "/x", label: "Voir" },
  evidence: {},
});

const ctx = { restaurantId: "houba", todayISO: "2026-11-05", nowMs: Date.parse("2026-11-05T08:00:00Z") };

test("un générateur qui tombe n'empêche pas les autres, et son erreur est dans le rapport", async () => {
  const gens: Generator[] = [
    { id: "a", assistant: "hugo", run: async () => ({ ideas: [idea("a1"), idea("a2")] }) },
    { id: "b", assistant: "emma", run: async () => { throw new Error("Meta indisponible"); } },
    { id: "c", assistant: "max", run: async () => ({ ideas: [], reason: "audit_ancien" }) },
  ];
  const r = await generateAll(ctx, gens);
  assert.deepEqual(r.ideas.map((i) => i.type), ["a1", "a2"]);
  assert.deepEqual(r.report, [
    { id: "a", assistant: "hugo", ideas: 2 },
    { id: "b", assistant: "emma", ideas: 0, error: "Meta indisponible" },
    { id: "c", assistant: "max", ideas: 0, reason: "audit_ancien" },
  ]);
});

test("les générateurs livrés : un par module d'Omar, ids uniques", () => {
  const ids = GENERATORS.map((g) => g.id);
  assert.deepEqual(ids, ["chloe", "chloe-ca", "lea-tickets", "lea-cadeau", "hugo", "emma", "max", "louis"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("la trace d'un générateur (jetons, brouillons écartés) arrive dans le rapport du passage", async () => {
  const gens = [
    { id: "louis", assistant: "louis" as const, run: async () => ({ ideas: [], reason: "rien_a_repondre", trace: { unanswered: 4, tokensIn: 900 } }) },
    { id: "max", assistant: "max" as const, run: async () => ({ ideas: [], reason: "pas_d_audit" }) },
  ];
  const { report } = await generateAll({ restaurantId: "houba", todayISO: "2026-11-10", nowMs: 0 }, gens);
  assert.deepEqual(report[0].trace, { unanswered: 4, tokensIn: 900 });
  assert.equal("trace" in report[1], false);
});
