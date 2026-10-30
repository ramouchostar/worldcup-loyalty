import { test } from "node:test";
import assert from "node:assert/strict";
import { consolePath, parseAnnouncement, proAnnouncementEmail } from "./pro-announcement";
import { ANNOUNCEMENT_DRAFT } from "../pro-announcement-draft";

test("le texte se découpe en intertitres, puces et paragraphes", () => {
  const b = parseAnnouncement("Bonjour,\n\n## Pub\n- un\n- deux\nSuite\n\nFin");
  assert.deepEqual(b, [
    { type: "paragraph", text: "Bonjour," },
    { type: "subheading", text: "Pub" },
    { type: "list", items: ["un", "deux"] },
    { type: "paragraph", text: "Suite" },
    { type: "paragraph", text: "Fin" },
  ]);
});

test("rien de saisi ne devient du HTML, le gras seul est rendu", () => {
  const e = proAnnouncementEmail({ restaurantName: "Belchicken Houba", restaurantId: "houba", subject: "Objet", title: "Titre", body: "Salut <script>x</script> **gras**" });
  assert.ok(!e.html.includes("<script>"));
  assert.ok(e.html.includes("&lt;script&gt;"));
  assert.match(e.html, /<strong[^>]*>gras<\/strong>/);
  assert.ok(!e.text.includes("**"));
});

test("le bouton mène à une page de la console de CET établissement", () => {
  assert.equal(consolePath("houba", "pub/nouvelle"), "/admin/houba/pub/nouvelle");
  assert.equal(consolePath("houba", "/pub/"), "/admin/houba/pub");
  assert.equal(consolePath("houba", "../platform"), "/admin/houba");
  assert.equal(consolePath("houba", "https://evil.example"), "/admin/houba");
  assert.equal(consolePath("houba", ""), "/admin/houba");
});

test("le brouillon : console restaurateur, aucun mot interdit côté client n'est en jeu, lien vers la Pub", () => {
  const e = proAnnouncementEmail({ restaurantName: "Belchicken De Bue", restaurantId: "de-bue", ...ANNOUNCEMENT_DRAFT });
  assert.ok(e.html.includes("/admin/de-bue/pub/nouvelle"));
  assert.ok(e.text.includes("Essayer la Pub"));
  assert.ok(e.preheader.length > 0 && e.preheader.length <= 120);
});
