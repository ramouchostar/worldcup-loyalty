import assert from "node:assert/strict";
import { test } from "node:test";
import { RESCUE_EVENTS, shouldOfferRescue } from "./rescue";

test("le secours s'ouvre quand le serveur n'a pas pu prendre la commande : pas de réponse, panne, imprimante hors ligne", () => {
  assert.equal(shouldOfferRescue(0), true); // pas de réseau
  assert.equal(shouldOfferRescue(500), true);
  assert.equal(shouldOfferRescue(502), true);
  assert.equal(shouldOfferRescue(503, "indisponible"), true);
  assert.equal(shouldOfferRescue(503, "imprimante_hors_ligne"), true);
});

test("le secours ne s'ouvre JAMAIS pour une erreur que le client corrige sur la page", () => {
  for (const code of ["forme", "prenom", "telephone", "trop_de_lignes", "quantite", "plat_inconnu", "plat_indisponible", "choix_invalide", "plafond"]) {
    assert.equal(shouldOfferRescue(code === "plat_inconnu" || code === "plat_indisponible" || code === "choix_invalide" || code === "plafond" ? 422 : 400, code), false, code);
  }
});

test("le secours ne contourne ni la limite par adresse ni la porte fermée", () => {
  assert.equal(shouldOfferRescue(429, "limite"), false);
  assert.equal(shouldOfferRescue(404), false); // fermé : la page n'est pas censée exister, pas de secours
  assert.equal(shouldOfferRescue(201), false);
});

test("les trois événements de la trace ont chacun leur motif, assez court pour la colonne (60 lettres)", () => {
  assert.deepEqual(Object.keys(RESCUE_EVENTS).sort(), ["copie", "propose", "whatsapp"]);
  for (const reason of Object.values(RESCUE_EVENTS)) assert.ok(reason.length >= 1 && reason.length <= 60);
  assert.equal(new Set(Object.values(RESCUE_EVENTS)).size, 3);
});
