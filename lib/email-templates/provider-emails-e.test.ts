import { test } from "node:test";
import assert from "node:assert/strict";
import { providerQuoteReceivedEmail } from "./provider-quote-received";
import { providerDateBookedEmail } from "./provider-date-booked";

test("devis reçu : le restaurateur est prévenu, sans le prix (il dépend de son plan)", () => {
  const m = providerQuoteReceivedEmail("Burger Palace", "Studio Croustille", "https://www.boosteats.be/admin/x/prestataires/m1");
  assert.equal(m.subject, "Studio Croustille t'a envoyé son devis");
  assert.ok(m.html.includes("https://www.boosteats.be/admin/x/prestataires/m1"));
  assert.doesNotMatch(m.html + m.text, /€|\d+ ?euros/i);
  assert.match(m.text, /décliner sans frais/);
});

test("date réservée : le prestataire lit le jour, l'heure, le contact et la règle des 48 h", () => {
  const m = providerDateBookedEmail({ providerName: "Studio", restaurantName: "Burger Palace", dateLabel: "mardi 27 octobre", startTime: "09:30", contact: "Karim · 0470 12 34 56", missionUrl: "https://www.boosteats.be/prestataire/mission/m1" });
  assert.equal(m.subject, "Date réservée : mardi 27 octobre chez Burger Palace");
  for (const part of [m.html, m.text]) {
    assert.ok(part.includes("09:30"));
    assert.ok(part.includes("Karim"));
  }
  assert.match(m.html, /48 h/);
});

test("un nom venu de la base est échappé", () => {
  const m = providerQuoteReceivedEmail("<b>X</b>", "<i>Y</i>", "https://x.be");
  assert.ok(!m.html.includes("<i>Y</i>"));
});
