import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryTracking } from "./delivery-tracking";

const NOW = new Date("2026-11-09T10:00:00Z");

test("sans secret : suivi éteint", () => {
  assert.deepEqual(deliveryTracking({ hasSecret: false, lastEventAt: null, unackedSinceEvent: 50, now: NOW }), { state: "off" });
});

test("la panne réelle : secret présent, dernier accusé le 1er octobre, 120 envois depuis → silence", () => {
  const r = deliveryTracking({ hasSecret: true, lastEventAt: "2026-10-01T21:49:56Z", unackedSinceEvent: 120, now: NOW });
  assert.equal(r.state, "silent");
});

test("jamais d'accusé mais des envois : silence aussi", () => {
  assert.equal(deliveryTracking({ hasSecret: true, lastEventAt: null, unackedSinceEvent: 5, now: NOW }).state, "silent");
});

test("accusé récent : ça marche", () => {
  assert.equal(deliveryTracking({ hasSecret: true, lastEventAt: "2026-11-09T09:30:00Z", unackedSinceEvent: 0, now: NOW }).state, "ok");
});

test("week-end calme : vieil accusé mais presque rien envoyé depuis → pas d'alerte", () => {
  assert.equal(deliveryTracking({ hasSecret: true, lastEventAt: "2026-11-05T09:00:00Z", unackedSinceEvent: 2, now: NOW }).state, "ok");
});

test("vient d'être branché, rien envoyé : en attente", () => {
  assert.equal(deliveryTracking({ hasSecret: true, lastEventAt: null, unackedSinceEvent: 0, now: NOW }).state, "waiting");
});
