import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeReceipt, notAReceiptMessage } from "./receipt-proof";

const ticket = { order_number: "2026-09-14/223/05481", has_restaurant_header: true, looks_like_qr_or_poster: false };

test("ticket lisible : accepté, avec ou sans en-tête (le Bestelnummer est en bas)", () => {
  assert.equal(judgeReceipt(ticket), "receipt");
  assert.equal(judgeReceipt({ ...ticket, has_restaurant_header: false }), "receipt");
});

test("en-tête sans clé : accepté ici, la clé manquante se reprend en photo plus loin", () => {
  assert.equal(judgeReceipt({ ...ticket, order_number: null }), "receipt");
});

test("affiche du programme sans clé : refusée comme affiche", () => {
  assert.equal(judgeReceipt({ order_number: null, has_restaurant_header: true, looks_like_qr_or_poster: true }), "poster");
});

test("une clé lue l'emporte sur la lecture « affiche » du modèle", () => {
  assert.equal(judgeReceipt({ ...ticket, looks_like_qr_or_poster: true }), "receipt");
});

test("ni en-tête ni clé : pas un ticket", () => {
  assert.equal(judgeReceipt({ order_number: null, has_restaurant_header: false, looks_like_qr_or_poster: false }), "not_a_receipt");
});

test("message de refus : nom de l'établissement et libellé de sa clé", () => {
  assert.match(notAReceiptMessage("Belchicken Kraainem", "Bestelnummer"), /Belchicken Kraainem.*Bestelnummer/);
  assert.match(notAReceiptMessage("Resto", null), /numéro de commande/);
});
