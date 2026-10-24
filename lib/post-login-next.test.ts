import { test } from "node:test";
import assert from "node:assert/strict";
import { consoleReturnPath } from "./post-login-next";

test("consoleReturnPath : une page d'établissement de la console, rien d'autre", () => {
  assert.equal(consoleReturnPath("/admin/houba/ca/2026-10-23"), "/admin/houba/ca/2026-10-23");
  assert.equal(consoleReturnPath("/admin/houba/ca/2026-10-23?modifier=1"), "/admin/houba/ca/2026-10-23?modifier=1");
  assert.equal(consoleReturnPath(encodeURIComponent("/admin/houba/ca/2026-10-23")), "/admin/houba/ca/2026-10-23");
  assert.equal(consoleReturnPath("/admin"), null);
  assert.equal(consoleReturnPath("/admin/houba"), null); // l'accueil : la destination par rôle y mène déjà
  assert.equal(consoleReturnPath("/admin/coupon/abc"), null);
  assert.equal(consoleReturnPath("//evil.com/admin/x/y"), null);
  assert.equal(consoleReturnPath("https://evil.com/admin/x/y"), null);
  assert.equal(consoleReturnPath("/platform/ca"), null);
  assert.equal(consoleReturnPath(null), null);
});
