import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAdFee } from "./service-offers";

test("frais Pub : tarif du forfait sans taux négocié", () => {
  assert.deepEqual(resolveAdFee("croissance", null), { plan: "croissance", feePct: 15, negotiated: false });
  assert.deepEqual(resolveAdFee("pro", undefined), { plan: "pro", feePct: 5, negotiated: false });
});

test("frais Pub : le taux négocié remplace le forfait (lu en texte par PostgREST pour un numeric)", () => {
  assert.deepEqual(resolveAdFee("croissance", 10), { plan: "croissance", feePct: 10, negotiated: true });
  assert.deepEqual(resolveAdFee("croissance", "10.00" as unknown as number), { plan: "croissance", feePct: 10, negotiated: true });
});

test("frais Pub : un taux illisible est ignoré", () => {
  assert.equal(resolveAdFee("croissance", 80).feePct, 15);
  assert.equal(resolveAdFee("croissance", -1).feePct, 15);
});
