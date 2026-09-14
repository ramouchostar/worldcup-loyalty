import { test } from "node:test";
import assert from "node:assert/strict";
import { canAutoSend } from "./ticket-auto-send";

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
