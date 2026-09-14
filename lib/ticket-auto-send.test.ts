import { test } from "node:test";
import assert from "node:assert/strict";
import { canAutoSend, missingReceiptParts } from "./ticket-auto-send";

const clean = { order_number: "2026-08-25/222/03398", amount: 2.5, key_corrected: false, has_reliable_key: true };

test("lecture propre : le ticket part tout seul", () => {
  assert.equal(canAutoSend(clean), true);
});

test("numéro absent ou vide : le récap s'affiche", () => {
  assert.equal(canAutoSend({ ...clean, order_number: null }), false);
  assert.equal(canAutoSend({ ...clean, order_number: "   " }), false);
  assert.equal(canAutoSend({ ...clean, order_number: undefined }), false);
});

test("année du numéro réparée : le membre doit vérifier", () => {
  assert.equal(canAutoSend({ ...clean, key_corrected: true }), false);
});

test("montant absent ou hors bornes serveur : le récap s'affiche", () => {
  assert.equal(canAutoSend({ ...clean, amount: null }), false);
  assert.equal(canAutoSend({ ...clean, amount: 0 }), false);
  assert.equal(canAutoSend({ ...clean, amount: 500.01 }), false);
  assert.equal(canAutoSend({ ...clean, amount: Number.NaN }), false);
  assert.equal(canAutoSend({ ...clean, amount: 500 }), true);
});

test("établissement sans clé fiable : pas de numéro à corriger, envoi direct", () => {
  assert.equal(canAutoSend({ ...clean, has_reliable_key: false, order_number: null }), true);
  // mais le montant reste exigé
  assert.equal(canAutoSend({ ...clean, has_reliable_key: false, amount: null }), false);
});

test("parties manquantes : dit quoi recadrer", () => {
  assert.equal(missingReceiptParts(clean), null);
  assert.deepEqual(missingReceiptParts({ ...clean, amount: null }), { total: true, key: false });
  assert.deepEqual(missingReceiptParts({ ...clean, order_number: null }), { total: false, key: true });
  assert.deepEqual(missingReceiptParts({ ...clean, amount: null, order_number: "" }), { total: true, key: true });
});

test("parties manquantes : pas de clé exigée sans clé fiable, année réparée ≠ recadrage", () => {
  assert.equal(missingReceiptParts({ ...clean, has_reliable_key: false, order_number: null }), null);
  // l'année réparée se vérifie au récap, elle ne demande pas une nouvelle photo
  assert.equal(missingReceiptParts({ ...clean, key_corrected: true }), null);
  assert.equal(canAutoSend({ ...clean, key_corrected: true }), false);
});
