import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "./claude-json";
import { THEMES_SCHEMA } from "./review-themes";

const msg = (text: string, stop_reason: "end_turn" | "max_tokens" | "refusal" = "end_turn") =>
  ({ content: text ? [{ type: "text", text, citations: null }] : [{ type: "thinking", thinking: "", signature: "x" }], stop_reason }) as never;

test("réponse complète : lue telle quelle", () => {
  assert.deepEqual(readJson(msg('{"actions":[]}')), { actions: [] });
});

test("les deux pannes vues sur l'audit Krusty disent leur vraie cause", () => {
  // Réflexion qui mange le plafond : texte vide ou JSON coupé.
  assert.throws(() => readJson(msg("", "max_tokens")), /coupée avant la fin/);
  assert.throws(() => readJson(msg('{"negatives":[{"key":"a"', "max_tokens")), /coupée avant la fin/);
  assert.throws(() => readJson(msg("")), /réponse vide \(arrêt : end_turn\)/);
  assert.throws(() => readJson(msg("{pas du json")), /JSON illisible/);
  assert.throws(() => readJson(msg("", "refusal")), /refusé/);
});

test("schéma des thèmes : chaque objet ferme ses propriétés (exigé par les sorties structurées)", () => {
  const walk = (s: unknown): void => {
    if (!s || typeof s !== "object") return;
    const o = s as Record<string, unknown>;
    if (o.type === "object") {
      assert.equal(o.additionalProperties, false);
      assert.deepEqual([...(o.required as string[])].sort(), Object.keys(o.properties as object).sort());
    }
    Object.values(o).forEach((v) => (Array.isArray(v) ? v.forEach(walk) : walk(v)));
  };
  walk(THEMES_SCHEMA);
});
