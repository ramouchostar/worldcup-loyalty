import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MISSION_STATUSES } from "./mission-states";
import { FUNNEL } from "./mission-stats";

const SRC = readFileSync("lib/missions-stats.ts", "utf8");

test("les statistiques lisent les passages d'état tels que le journal les écrit, et seulement chez la plateforme", () => {
  assert.match(SRC, /\.eq\("kind", "status"\)/);
  assert.match(readFileSync("lib/missions-superadmin.ts", "utf8"), /kind: "status"/);
  assert.match(readFileSync("app/platform/prestataires/chiffres/page.tsx", "utf8"), /is_super_admin/);
});

test("chaque étape de l'entonnoir et chaque étape lue existent dans les états d'une mission", () => {
  const known = new Set<string>(MISSION_STATUSES);
  for (const f of FUNNEL) for (const s of f.reached ?? []) assert.ok(known.has(s), s);
  const stages = /const STAGES = \[([^\]]+)\]/.exec(SRC)![1].match(/"(\w+)"/g)!.map((x) => x.replace(/"/g, ""));
  for (const s of stages) assert.ok(known.has(s), s);
  // Toute étape de l'entonnoir doit être lue dans le journal, sinon la mission qui l'a dépassée ne compterait pas.
  for (const f of FUNNEL) for (const s of f.reached ?? []) assert.ok(stages.includes(s) || s === "suspendu" || s === "verse", `non lue : ${s}`);
});
