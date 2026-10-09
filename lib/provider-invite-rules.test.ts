import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeInvite, normalizeEmail, type InviteRow } from "./provider-invite-rules";

const NOW = new Date("2026-10-09T12:00:00Z");
const row = (over: Partial<InviteRow> = {}): InviteRow => ({
  email: "Studio@Croustille.be",
  expires_at: "2026-10-20T00:00:00Z",
  accepted_at: null,
  revoked_at: null,
  ...over,
});

test("un lien vivant, ouvert avec la bonne adresse (casse et espaces ignorés), est valable", () => {
  assert.equal(judgeInvite(row(), NOW, "studio@croustille.be"), "valid");
  assert.equal(judgeInvite(row(), NOW, "  STUDIO@CROUSTILLE.BE "), "valid");
});

test("le lien est lié à une adresse : un autre compte ne l'accepte pas", () => {
  assert.equal(judgeInvite(row(), NOW, "quelquun@gmail.com"), "email-mismatch");
  assert.equal(judgeInvite(row(), NOW, ""), "email-mismatch");
  assert.equal(judgeInvite(row(), NOW, null), "email-mismatch");
});

test("avant connexion, on juge le lien seul", () => {
  assert.equal(judgeInvite(row(), NOW), "valid");
});

test("révoqué, accepté, expiré : refusés, dans cet ordre de gravité", () => {
  assert.equal(judgeInvite(row({ revoked_at: "2026-10-01T00:00:00Z" }), NOW, "studio@croustille.be"), "revoked");
  assert.equal(judgeInvite(row({ accepted_at: "2026-10-01T00:00:00Z" }), NOW, "studio@croustille.be"), "accepted");
  assert.equal(judgeInvite(row({ expires_at: "2026-10-09T12:00:00Z" }), NOW, "studio@croustille.be"), "expired");
  assert.equal(judgeInvite(row({ revoked_at: "2026-10-01T00:00:00Z", accepted_at: "2026-10-02T00:00:00Z" }), NOW), "revoked");
});

test("un lien périmé l'emporte sur une adresse qui ne correspond pas", () => {
  assert.equal(judgeInvite(row({ expires_at: "2026-10-01T00:00:00Z" }), NOW, "autre@x.be"), "expired");
});

test("adresses normalisées", () => {
  assert.equal(normalizeEmail("  A@B.be "), "a@b.be");
  assert.equal(normalizeEmail(undefined), "");
});
