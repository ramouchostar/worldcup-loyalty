import assert from "node:assert/strict";
import { test } from "node:test";
import { siteOrdersAllowed } from "./access";

test("siteOrdersAllowed : il faut le drapeau ET le forfait Pro", () => {
  assert.equal(siteOrdersAllowed(true, "pro"), true);
  assert.equal(siteOrdersAllowed(true, "croissance"), false);
  assert.equal(siteOrdersAllowed(true, "gratuit"), false);
  assert.equal(siteOrdersAllowed(false, "pro"), false);
  assert.equal(siteOrdersAllowed(false, "gratuit"), false);
});
