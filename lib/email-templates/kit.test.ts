import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, firstNameOf, formatDelta } from "./kit";
import { crossedMilestone, nextMilestone } from "./pro-milestone";
import { recapHeadline } from "./pro-weekly-recap";
import { teamInviteEmail } from "./member-team-invite";

test("esc : tout texte venu de la base est échappé", () => {
  assert.equal(esc(`<b>"Tom" & 'Jerry'</b>`), "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
  assert.equal(esc(null), "");
});

test("un nom d'équipe piégé n'injecte rien dans l'e-mail", () => {
  const email = teamInviteEmail({
    theme: { restaurantName: "Resto", logoUrl: null, primary: "#000000", dark: "#111111" },
    restaurantId: "r",
    firstName: null,
    choices: [{ id: "1", label: '<img src=x onerror="alert(1)">', emoji: "🎓", hasCaptain: false }],
    firstTeamGift: null,
    link: (p) => `https://x.test${p}`,
    manageUrl: "https://x.test/compte",
    stopUrl: "https://x.test/stop",
  });
  assert.ok(!email.html.includes("<img src=x"));
  assert.ok(email.html.includes("&lt;img src=x"));
});

test("formatDelta : hausse, baisse, stable, sans base", () => {
  assert.deepEqual(formatDelta(64, 52), { text: "+23 % vs sem. préc.", direction: "up" });
  assert.deepEqual(formatDelta(40, 50), { text: "-20 % vs sem. préc.", direction: "down" });
  assert.deepEqual(formatDelta(50, 50), { text: "stable", direction: "flat" });
  assert.deepEqual(formatDelta(3, 0), { text: "nouveau", direction: "up" });
  assert.equal(formatDelta(0, 0), null);
});

test("firstNameOf : le premier mot, sinon rien", () => {
  assert.equal(firstNameOf("  Léa Martin "), "Léa");
  assert.equal(firstNameOf(""), null);
  assert.equal(firstNameOf(null), null);
});

test("caps : le plus haut franchi l'emporte, un seul e-mail", () => {
  assert.equal(crossedMilestone("members", 48, 52), 50);
  assert.equal(crossedMilestone("members", 20, 120), 100);
  assert.equal(crossedMilestone("members", 52, 60), null);
  assert.equal(crossedMilestone("revenue", 900, 1000), 1000);
  assert.equal(nextMilestone("members", 52), 100);
  assert.equal(nextMilestone("members", 5000), null);
});

test("récap : la phrase d'en-tête suit la semaine", () => {
  assert.equal(recapHeadline({ tickets: 0, ticketsPrev: 10, bestTicketsBefore: 20, newMembers: 0 }), "Aucun ticket cette semaine — une annonce peut relancer tes habitués.");
  assert.equal(recapHeadline({ tickets: 64, ticketsPrev: 52, bestTicketsBefore: 58, newMembers: 17 }), "Ta meilleure semaine depuis le lancement.");
  assert.equal(recapHeadline({ tickets: 40, ticketsPrev: 30, bestTicketsBefore: 58, newMembers: 2 }), "Une semaine nettement au-dessus de la précédente.");
  assert.equal(recapHeadline({ tickets: 20, ticketsPrev: 30, bestTicketsBefore: 58, newMembers: 2 }), "Une semaine plus calme que la précédente.");
  assert.equal(recapHeadline({ tickets: 30, ticketsPrev: 30, bestTicketsBefore: 58, newMembers: 12 }), "12 nouveaux clients ont rejoint ton programme.");
  assert.equal(recapHeadline({ tickets: 30, ticketsPrev: 30, bestTicketsBefore: 58, newMembers: 2 }), "Une semaine dans la lignée de la précédente.");
});
