import { test } from "node:test";
import assert from "node:assert/strict";
import { DELETION_DETAIL_MAX, parseDeletionReason } from "./account-deletion";

test("raison reconnue gardée, précision coupée à la longueur maximale", () => {
  const r = parseDeletionReason({ reason: "autre", detail: `  ${"x".repeat(DELETION_DETAIL_MAX + 50)}  ` });
  assert.equal(r.reason, "autre");
  assert.equal(r.detail?.length, DELETION_DETAIL_MAX);
});

test("sans raison, la suppression passe quand même (raison facultative)", () => {
  assert.deepEqual(parseDeletionReason(null), { reason: null, detail: null });
  assert.deepEqual(parseDeletionReason({}), { reason: null, detail: null });
});

test("raison inconnue ignorée, et sa précision avec", () => {
  assert.deepEqual(parseDeletionReason({ reason: "hack'; drop", detail: "texte" }), { reason: null, detail: null });
});

test("précision vide → null", () => {
  assert.deepEqual(parseDeletionReason({ reason: "trop_de_messages", detail: "   " }), { reason: "trop_de_messages", detail: null });
});
