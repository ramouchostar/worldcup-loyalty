import { test } from "node:test";
import assert from "node:assert/strict";
import { autoValidateCutoff, SOCIAL_ACTION_AUTO_VALIDATE_HOURS } from "./micro-rewards-auto";

test("actions sociales : validées automatiquement 4 h après la réclamation", () => {
  assert.equal(SOCIAL_ACTION_AUTO_VALIDATE_HOURS, 4);
  assert.equal(autoValidateCutoff(new Date("2026-09-18T14:00:00Z")), "2026-09-18T10:00:00.000Z");
});
