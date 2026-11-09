import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResendWebhook, journalEvent, signPayload, verifyResendWebhook } from "./resend-webhook";

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

test("secret collé avec un espace, des guillemets ou un retour à la ligne : accepté quand même", () => {
  const sig = signPayload(SECRET, "msg_1", String(NOW), BODY);
  const base = { id: "msg_1", timestamp: String(NOW), signature: `v1,${sig}`, body: BODY, nowSeconds: NOW };
  for (const pasted of [` ${SECRET}`, `${SECRET}\n`, `"${SECRET}"`, ` "${SECRET}" `]) {
    assert.equal(checkResendWebhook({ ...base, secret: pasted }), "ok", JSON.stringify(pasted));
  }
});

test("le refus dit sa cause", () => {
  const sig = signPayload(SECRET, "msg_1", String(NOW), BODY);
  const base = { secret: SECRET, id: "msg_1", timestamp: String(NOW), signature: `v1,${sig}`, body: BODY, nowSeconds: NOW };
  assert.equal(checkResendWebhook({ ...base, signature: null }), "missing_headers");
  assert.equal(checkResendWebhook({ ...base, nowSeconds: NOW + 600 }), "stale_timestamp");
  assert.equal(checkResendWebhook({ ...base, secret: `whsec_${Buffer.from("autre").toString("base64")}` }), "bad_signature");
});
