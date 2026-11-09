import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalOfferLine, showOneButtonArrival } from "./arrival";

test("l'écran en un bouton : drapeau allumé, QR imprimé, visiteur non connecté", () => {
  assert.equal(showOneButtonArrival({ flagOn: true, utmSource: "qr_code", isLoggedIn: false }), true);
  assert.equal(showOneButtonArrival({ flagOn: true, utmSource: " QR_CODE ", isLoggedIn: false }), true);
});

test("jamais sans le drapeau, jamais hors QR, jamais pour un membre connecté", () => {
  assert.equal(showOneButtonArrival({ flagOn: false, utmSource: "qr_code", isLoggedIn: false }), false);
  assert.equal(showOneButtonArrival({ flagOn: true, utmSource: undefined, isLoggedIn: false }), false);
  assert.equal(showOneButtonArrival({ flagOn: true, utmSource: "flyer", isLoggedIn: false }), false);
  assert.equal(showOneButtonArrival({ flagOn: true, utmSource: "qr_code", isLoggedIn: true }), false);
});

test("la ligne d'offre : cadeau d'accueil, sinon points, sinon rien", () => {
  assert.equal(arrivalOfferLine({ welcome: { name: "Frites" }, showcaseCount: 3 }), "Frites offert pour ton premier ticket");
  assert.equal(arrivalOfferLine({ welcome: null, showcaseCount: 2 }), "Des points à chaque ticket");
  assert.equal(arrivalOfferLine({ welcome: null, showcaseCount: 0 }), null);
});
