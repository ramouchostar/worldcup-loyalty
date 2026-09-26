import { test } from "node:test";
import assert from "node:assert/strict";
import { qrLocationLabel, usesBelchickenQrTemplate } from "./qr-template";

test("les trois Belchicken portent le design QR Belchicken", () => {
  for (const id of ["kraainem", "houba", "de-bue"]) assert.equal(usesBelchickenQrTemplate(id), true, id);
});

test("les autres établissements gardent le template générique", () => {
  for (const id of ["poulet25", "demo-pizza", "", "Kraainem"]) assert.equal(usesBelchickenQrTemplate(id), false, id);
});

test("la mention de lieu retire l'enseigne portée par le logo", () => {
  assert.equal(qrLocationLabel("Belchicken Kraainem"), "Kraainem");
  assert.equal(qrLocationLabel("Belchicken Houba"), "Houba");
  assert.equal(qrLocationLabel("BelChicken – Uccle De Bue"), "Uccle De Bue");
  assert.equal(qrLocationLabel("Bel Chicken Uccle"), "Uccle");
});

test("sans enseigne reconnue, le nom complet reste", () => {
  assert.equal(qrLocationLabel("Houba"), "Houba");
  assert.equal(qrLocationLabel("Belchicken"), "Belchicken");
  assert.equal(qrLocationLabel("Belchickenland"), "Belchickenland");
});
