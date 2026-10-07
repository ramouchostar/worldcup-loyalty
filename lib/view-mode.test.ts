import { test } from "node:test";
import assert from "node:assert/strict";
import { isClientMode, pickDestination, type DestinationFacts } from "./view-mode";

const base: DestinationFacts = {
  isSuperAdmin: false,
  hasConsole: false,
  membershipRestaurantId: null,
  hasDisplayName: true,
};

test("routage normal : plateforme > console > membre", () => {
  assert.equal(pickDestination({ ...base, isSuperAdmin: true, hasConsole: true }), "/platform");
  assert.equal(pickDestination({ ...base, hasConsole: true, membershipRestaurantId: "r1" }), "/admin");
  assert.equal(pickDestination({ ...base, membershipRestaurantId: "r1" }), "/r/r1/dashboard");
  assert.equal(pickDestination(base), "/join");
  assert.equal(pickDestination({ ...base, hasDisplayName: false }), "/register");
});

test("mode client : saute plateforme et console", () => {
  const f = { ...base, isSuperAdmin: true, hasConsole: true };
  assert.equal(pickDestination(f, { clientMode: true }), "/join");
  assert.equal(pickDestination({ ...f, membershipRestaurantId: "r1" }, { clientMode: true }), "/r/r1/dashboard");
});

test("as=resto l'emporte sur le mode client", () => {
  assert.equal(pickDestination({ ...base, hasConsole: true }, { as: "resto", clientMode: true }), "/admin");
  assert.equal(pickDestination({ ...base, isSuperAdmin: true }, { as: "resto", clientMode: true }), "/platform");
  assert.equal(pickDestination(base, { as: "resto" }), "/become-a-partner");
});

test("isClientMode ne reconnaît que « client »", () => {
  assert.equal(isClientMode("client"), true);
  assert.equal(isClientMode("autre"), false);
  assert.equal(isClientMode(undefined), false);
});
