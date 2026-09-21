import { test } from "node:test";
import assert from "node:assert/strict";
import { journalEvent, signPayload, verifyResendWebhook } from "./resend-webhook";

const SECRET = `whsec_${Buffer.from("un-secret-de-test-assez-long").toString("base64")}`;
const BODY = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
const NOW = 1_790_000_000;

test("signature valide acceptée, y compris pendant une rotation de secret", () => {
  const sig = signPayload(SECRET, "msg_1", String(NOW), BODY);
  assert.equal(verifyResendWebhook({ secret: SECRET, id: "msg_1", timestamp: String(NOW), signature: `v1,${sig}`, body: BODY, nowSeconds: NOW }), true);
  assert.equal(verifyResendWebhook({ secret: SECRET, id: "msg_1", timestamp: String(NOW), signature: `v1,autre v1,${sig}`, body: BODY, nowSeconds: NOW }), true);
});

test("corps modifié, secret faux, horodatage trop vieux : refusé", () => {
  const sig = signPayload(SECRET, "msg_1", String(NOW), BODY);
  const base = { secret: SECRET, id: "msg_1", timestamp: String(NOW), signature: `v1,${sig}`, nowSeconds: NOW };
  assert.equal(verifyResendWebhook({ ...base, body: BODY.replace("abc", "xyz") }), false);
  assert.equal(verifyResendWebhook({ ...base, body: BODY, secret: `whsec_${Buffer.from("autre").toString("base64")}` }), false);
  assert.equal(verifyResendWebhook({ ...base, body: BODY, nowSeconds: NOW + 600 }), false);
  assert.equal(verifyResendWebhook({ ...base, body: BODY, signature: null }), false);
});

test("seuls délivré, rebond et plainte changent le journal", () => {
  assert.equal(journalEvent("email.delivered"), "delivered");
  assert.equal(journalEvent("email.bounced"), "bounced");
  assert.equal(journalEvent("email.complained"), "complained");
  assert.equal(journalEvent("email.opened"), null);
  assert.equal(journalEvent("email.clicked"), null);
});
