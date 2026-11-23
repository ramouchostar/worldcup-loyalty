import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGIN_REQUIRED, PENDING_SITE_ORDER_COOKIE, accountFirstName, pendingDestination } from "./account";
import { shouldOfferRescue } from "./rescue";

test("accountFirstName : le premier mot du nom du compte, jamais le nom de famille", () => {
  assert.equal(accountFirstName("Amina Benali"), "Amina");
  assert.equal(accountFirstName("  Amina   Benali  "), "Amina");
  assert.equal(accountFirstName("Jean-Pierre Dupont"), "Jean-Pierre");
  assert.equal(accountFirstName("Amina"), "Amina");
});

test("accountFirstName : un nom absent, vide, illisible ou d'un compte supprimé ne donne rien (le client le tape)", () => {
  for (const v of [undefined, null, 42, "", "   ", "<>", "Compte supprimé"]) assert.equal(accountFirstName(v), "", String(v));
});

test("accountFirstName : sans balise, 24 lettres au plus", () => {
  assert.ok(!/[<>]/.test(accountFirstName("<b>Amina</b> X")));
  assert.ok(accountFirstName("A".repeat(60)).length <= 24);
});

test("pendingDestination : le ticket prime sur la commande, la commande sur la page de l'établissement", () => {
  assert.equal(pendingDestination("r1", { ticket: true, siteOrder: false }), "/r/r1/submit-order?resume=1");
  assert.equal(pendingDestination("r1", { ticket: true, siteOrder: true }), "/r/r1/submit-order?resume=1");
  assert.equal(pendingDestination("r1", { ticket: false, siteOrder: true }), "/commander/r1");
  assert.equal(pendingDestination("r1", { ticket: false, siteOrder: false }), "/r/r1");
});

test("la connexion demandée n'ouvre JAMAIS le secours WhatsApp : ce n'est pas une panne", () => {
  assert.equal(shouldOfferRescue(401, LOGIN_REQUIRED.code), false);
  assert.equal(shouldOfferRescue(401), false);
});

test("le code, le motif de la trace et le cookie ont chacun leur nom (la colonne du motif tient en 60 lettres)", () => {
  assert.equal(LOGIN_REQUIRED.code, "connexion");
  assert.ok(LOGIN_REQUIRED.reason.length >= 1 && LOGIN_REQUIRED.reason.length <= 60);
  assert.notEqual(LOGIN_REQUIRED.reason, LOGIN_REQUIRED.code);
  assert.equal(PENDING_SITE_ORDER_COOKIE, "pending_site_order");
});
