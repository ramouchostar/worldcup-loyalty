import { test } from "node:test";
import assert from "node:assert/strict";
import { providerInviteEmail } from "./provider-invite";
import { providerBriefReceivedEmail } from "./provider-brief-received";

const url = "https://www.boosteats.be/prestataire/invitation/abc123";

test("l'invitation dit le lien, l'adresse à laquelle il est lié et la date limite", () => {
  const m = providerInviteEmail("Studio Croustille", url, "2026-10-23T00:00:00Z", "studio@croustille.be");
  for (const part of [m.html, m.text]) {
    assert.ok(part.includes(url));
    assert.ok(part.includes("studio@croustille.be"));
    assert.match(part, /23 octobre 2026/);
  }
  assert.match(m.subject, /espace prestataire/i);
});

test("l'invitation ne porte pas la ligne de marque des restaurateurs", () => {
  const m = providerInviteEmail("Studio", url, "2026-10-23T00:00:00Z", "a@b.be");
  assert.doesNotMatch(m.html, /programme de fidélité/);
  assert.match(m.html, /prestataires de confiance/);
});

test("le brief reçu ne révèle rien du brief : nom du restaurant, objectif, lien", () => {
  const m = providerBriefReceivedEmail("Studio", "Burger Palace", "Nouveau plat", "https://www.boosteats.be/prestataire/mission/m1");
  assert.equal(m.subject, "Nouveau brief de Burger Palace");
  assert.ok(m.html.includes("https://www.boosteats.be/prestataire/mission/m1"));
  assert.match(m.text, /Nouveau plat/);
  assert.doesNotMatch(m.html + m.text, /€|budget/i);
});

test("un nom venu de la base est échappé dans le HTML", () => {
  const m = providerBriefReceivedEmail("Studio", "<script>alert(1)</script>", null, "https://x.be/m");
  assert.ok(!m.html.includes("<script>alert(1)</script>"));
});
