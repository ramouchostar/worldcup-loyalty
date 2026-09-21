import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGES, SEQUENCES, addToTotals, emptyTotals, isSequenceKey, rate, totalsByKey } from "./message-catalog";

test("les sept séquences de l'ADR 0063, et elles seules, se pilotent", () => {
  assert.deepEqual(
    SEQUENCES.map((s) => s.key),
    ["first_ticket", "team_invite", "referral_nudge", "install_app", "milestone", "weekly_recap", "weekly_idea"]
  );
  assert.equal(isSequenceKey("welcome"), false);
  assert.equal(isSequenceKey("n'importe quoi"), false);
  assert.equal(new Set(MESSAGES.map((m) => m.key)).size, MESSAGES.length);
});

test("totaux : un échec n'est pas parti, un témoin n'est pas une tentative", () => {
  const rows = [
    { message_key: "welcome", channel: "email", status: "delivered", clicked_at: "x", delivered_at: "x" },
    { message_key: "welcome", channel: "email", status: "sent", clicked_at: null, delivered_at: null },
    { message_key: "welcome", channel: "email", status: "failed", clicked_at: null, delivered_at: null },
    { message_key: "welcome", channel: "email", status: "bounced", clicked_at: null, delivered_at: null },
    { message_key: "first_ticket", channel: "none", status: "holdout", clicked_at: null, delivered_at: null },
  ];
  const t = rows.reduce(addToTotals, emptyTotals());
  assert.deepEqual(t, { attempted: 4, sent: 3, failed: 1, delivered: 1, bounced: 1, complained: 0, clicked: 1, holdout: 1 });
  assert.equal(totalsByKey(rows).get("first_ticket")?.holdout, 1);
});

test("un taux sur zéro envoi n'est pas 0 %", () => {
  assert.equal(rate(0, 0), null);
  assert.equal(rate(1, 3), 33);
});
