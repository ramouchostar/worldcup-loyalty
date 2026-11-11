import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSISTANTS, DAILY_IDEA_CAP, REFUSAL_REASON_LABELS, type AssistantId, type Idea } from "./types";
import type { ChloeIdea } from "./chloe";
import type { ChloeCaIdea } from "./chloe-ca";
import type { LeaIdea } from "./lea";
import type { HugoIdea } from "./hugo";
import type { EmmaIdea } from "./emma";
import type { MaxIdea } from "./max";
import type { LouisIdea } from "./louis";

// Le contrat de la brigade (ADR 0089) : chaque idée d'assistant DOIT être une `Idea`.
// Vérifié à la compilation (npm run type-check) : un module qui s'en écarte casse le build.
type Conforms<T extends Idea> = T;
export type BrigadeIdea =
  | Conforms<ChloeIdea>
  | Conforms<ChloeCaIdea>
  | Conforms<LeaIdea>
  | Conforms<HugoIdea>
  | Conforms<EmmaIdea>
  | Conforms<MaxIdea>
  | Conforms<LouisIdea>;

test("les sept assistants, chacun sous sa propre clé", () => {
  const ids = Object.keys(ASSISTANTS) as AssistantId[];
  assert.equal(ids.length, 7);
  for (const id of ids) assert.equal(ASSISTANTS[id].id, id);
});

test("le plafond du jour et les raisons de refus", () => {
  assert.equal(DAILY_IDEA_CAP, 3);
  assert.ok(Object.values(REFUSAL_REASON_LABELS).every((l) => l.length > 0 && l.length <= 30));
});
