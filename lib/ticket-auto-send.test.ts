import { test } from "node:test";
import assert from "node:assert/strict";
import { missingReceiptParts } from "./ticket-auto-send";

const clean = { order_number: "2026-08-25/222/03398", amount: 2.5, key_corrected: false, has_reliable_key: true };

test("lecture propre : rien ne manque, le ticket part", () => {
  assert.equal(missingReceiptParts(clean), null);
});

test("numéro absent ou vide : la clé manque", () => {
  assert.deepEqual(missingReceiptParts({ ...clean, order_number: null }), { total: false, key: true });
  assert.deepEqual(missingReceiptParts({ ...clean, order_number: "   " }), { total: false, key: true });
  assert.deepEqual(missingReceiptParts({ ...clean, order_number: undefined }), { total: false, key: true });
});

test("montant absent ou hors bornes serveur : le total manque", () => {
  assert.deepEqual(missingReceiptParts({ ...clean, amount: null }), { total: true, key: false });
  assert.deepEqual(missingReceiptParts({ ...clean, amount: 0 }), { total: true, key: false });
  assert.deepEqual(missingReceiptParts({ ...clean, amount: 500.01 }), { total: true, key: false });
  assert.deepEqual(missingReceiptParts({ ...clean, amount: Number.NaN }), { total: true, key: false });
  assert.equal(missingReceiptParts({ ...clean, amount: 500 }), null);
});

test("les deux manquent : dit de recadrer les deux", () => {
  assert.deepEqual(missingReceiptParts({ ...clean, amount: null, order_number: "" }), { total: true, key: true });
});

test("établissement sans clé fiable : le numéro n'est pas exigé, le montant si", () => {
  assert.equal(missingReceiptParts({ ...clean, has_reliable_key: false, order_number: null }), null);
  assert.deepEqual(missingReceiptParts({ ...clean, has_reliable_key: false, amount: null }), { total: true, key: false });
});

test("année réparée = nouvelle photo (ADR 0058), sauf sans clé fiable", () => {
  assert.deepEqual(missingReceiptParts({ ...clean, key_corrected: true }), { total: false, key: true });
  assert.equal(missingReceiptParts({ ...clean, has_reliable_key: false, key_corrected: true }), null);
});
