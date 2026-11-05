import { test } from "node:test";
import assert from "node:assert/strict";
import { deadlineLabel, ideasSummary, outcomeLabel } from "./ideas-view";

const NOW = Date.parse("2026-11-05T08:00:00Z"); // jeudi 9 h à Bruxelles

test("la date limite en mots de gérant", () => {
  assert.equal(deadlineLabel("2026-11-05T22:59:59Z", NOW), "Ce soir");
  assert.equal(deadlineLabel("2026-11-06T22:59:59Z", NOW), "Demain");
  assert.match(deadlineLabel("2026-11-11T22:59:59Z", NOW), /^Jusqu'au 11 nov/);
  // 23 h 30 UTC le 5 = 0 h 30 le 6 à Bruxelles : c'est demain, pas ce soir.
  assert.equal(deadlineLabel("2026-11-05T23:30:00Z", NOW), "Demain");
});

test("le résumé et le résultat d'une idée passée", () => {
  assert.equal(ideasSummary(0), "Tout est décidé pour aujourd'hui.");
  assert.equal(ideasSummary(1), "1 idée · environ 5 minutes");
  assert.equal(ideasSummary(3), "3 idées · environ 5 minutes");
  assert.equal(outcomeLabel("executee", null), "Oui");
  assert.equal(outcomeLabel("refusee", "trop_cher"), "Non · trop cher");
  assert.equal(outcomeLabel("expiree", null), "Expirée");
});
