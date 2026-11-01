import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGES, OBJECTIONS, SCRIPT, PLANS, LEAVE_BEHIND, textBlocks } from "./visit-kit";

test("textBlocks : paragraphes et listes « - »", () => {
  const out = textBlocks("Premier\nparagraphe.\n\n- un\n- deux\n\nFin.");
  assert.deepEqual(out, [
    { kind: "p", text: "Premier paragraphe." },
    { kind: "ul", items: ["un", "deux"] },
    { kind: "p", text: "Fin." },
  ]);
  assert.deepEqual(textBlocks("  \n\n "), []);
});

test("les identifiants des messages sont uniques (bouton Copier)", () => {
  const ids = MESSAGES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("le kit respecte les règles de texte (ADR 0064, 0070, décision du 2026-11-01)", () => {
  const all = JSON.stringify([MESSAGES, OBJECTIONS, SCRIPT, PLANS, LEAVE_BEHIND]).toLowerCase();
  for (const banned of ["grâce à nous", "exploser", "réseau de clients", "tickets de plus", "ocr", "intelligence artificielle", "99 €"]) {
    assert.ok(!all.includes(banned), `interdit dans le kit : « ${banned} »`);
  }
  assert.ok(all.includes("150 €/mois"), "Croissance à 150 €/mois");
});
