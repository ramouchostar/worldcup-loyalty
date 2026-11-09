import { test } from "node:test";
import assert from "node:assert/strict";
import { DELIVERY_TICKET_MESSAGE, isDeliveryChannel, outsideProgramByCode, outsideProgramMessage } from "./refused-tickets";

test("les canaux de livraison lus sur les tickets réels sont reconnus", () => {
  for (const c of ["Livraison", "LIVRAISON", "Uber Eats Livraison", "Deliveroo", "Delivery", "Just Eat"]) {
    assert.equal(isDeliveryChannel(c), true, c);
  }
});

test("les canaux acceptés ne sont jamais pris pour de la livraison", () => {
  for (const c of ["Self-order kiosk", "Eat in", "Intake module", "Take away", "Collection", "Self order kiosk", null, undefined, ""]) {
    assert.equal(isDeliveryChannel(c as string | null), false, String(c));
  }
});

test("le code 234 est Belchicken Ixelles, les autres codes ne le sont pas", () => {
  assert.equal(outsideProgramByCode("2026-11-03/234/04571"), "Belchicken Ixelles");
  assert.equal(outsideProgramByCode("2026-11-03/223/04571"), null);
  assert.equal(outsideProgramByCode("2026-11-03/258/04571"), null);
  assert.equal(outsideProgramByCode(null), null);
  assert.equal(outsideProgramByCode("04571"), null);
});

test("les messages disent la vraie cause et ne demandent pas de nouvelle photo", () => {
  assert.match(DELIVERY_TICKET_MESSAGE, /livraison/i);
  const m = outsideProgramMessage("Belchicken Ixelles", "Belchicken Kraainem");
  assert.match(m, /Belchicken Ixelles/);
  assert.match(m, /Belchicken Kraainem/);
  for (const t of [DELIVERY_TICKET_MESSAGE, m]) assert.doesNotMatch(t, /reprends|nouvelle photo/i);
});
