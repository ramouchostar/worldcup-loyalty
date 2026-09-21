import { test } from "node:test";
import assert from "node:assert/strict";
import { isSendId, looksLikeBot, safeRedirectPath, trackLinks } from "./message-links";

const APP = "https://boosteats.tech";
const ID = "3f2b8c1e-9d4a-4b7e-8c21-5a6f0e9d1b23";

test("redirection : seulement un chemin de notre domaine", () => {
  assert.equal(safeRedirectPath("/r/kraainem/my-rewards"), "/r/kraainem/my-rewards");
  assert.equal(safeRedirectPath("/admin/x/broadcast?sendOn=2026-09-21&promoOn=2026-09-22"), "/admin/x/broadcast?sendOn=2026-09-21&promoOn=2026-09-22");
  assert.equal(safeRedirectPath("//evil.com"), null);
  assert.equal(safeRedirectPath("/\\evil.com"), null);
  assert.equal(safeRedirectPath("https://evil.com"), null);
  assert.equal(safeRedirectPath("/a\nb"), null);
  assert.equal(safeRedirectPath(null), null);
});

test("identifiant d'envoi : un UUID, rien d'autre", () => {
  assert.equal(isSendId(ID), true);
  assert.equal(isSendId("abc"), false);
  assert.equal(isSendId(`${ID}' or 1=1`), false);
});

test("les liens vers notre domaine passent par /c, les autres non", () => {
  const out = trackLinks(
    {
      subject: "s",
      preheader: "p",
      html: `<a href="${APP}/r/k/points?x=1&amp;y=2">A</a> <a href="https://wa.me/?text=hi">W</a> <img src="${APP}/logo.png" />`,
      text: `Voir : ${APP}/r/k/points\nWhatsApp : https://wa.me/?text=hi`,
    },
    APP,
    ID
  );
  assert.ok(out.html.includes(`href="${APP}/c/${ID}?to=${encodeURIComponent("/r/k/points?x=1&y=2")}"`), out.html);
  assert.ok(out.html.includes('href="https://wa.me/?text=hi"'));
  assert.ok(out.html.includes(`src="${APP}/logo.png"`));
  assert.ok(out.text.includes(`${APP}/c/${ID}?to=${encodeURIComponent("/r/k/points")}`));
  assert.ok(out.text.includes("https://wa.me/?text=hi"));
});

test("les robots de messagerie ne comptent pas comme un clic", () => {
  assert.equal(looksLikeBot(null), true);
  assert.equal(looksLikeBot("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(looksLikeBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), false);
});
