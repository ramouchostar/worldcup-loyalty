import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeHeader, type EstablishmentIdentity } from "./receipt-header";

// Identités enregistrées en production (lecture seule, 2026-11-09) + Ixelles en attente.
const IDS: EstablishmentIdentity[] = [
  { id: "houba", name: "Belchicken Houba", address: "Av. Houba de Strooper 96, 1020 Bruxelles" },
  { id: "de-bue", name: "Belchicken De Bue", address: "Rue Xavier De Bue 47, 1180 Uccle" },
  { id: "kraainem", name: "Belchicken Kraainem", address: "Av. de Kraainem 185, 1200 Woluwe-Saint-Lambert" },
  { id: "ixelles", name: "Belchicken Ixelles", address: "Chau. d'Ixelles, Ixelles" },
];

test("Kraainem : en-tête néerlandais (Kraainemlaan 185) reconnu pour Kraainem", () => {
  const r = judgeHeader("Belchicken Kraainem", "Kraainemlaan 185 Sint-Lambrechts-Woluwe", "kraainem", IDS);
  assert.deepEqual(r, { verdict: "own", matched: "kraainem" });
});

test("Kraainem : l'adresse seule suffit quand le nom n'est pas lu", () => {
  assert.equal(judgeHeader(null, "Kraainemlaan 185", "kraainem", IDS).verdict, "own");
});

test("De Bue : « Belchicken Uccle De Bue » est bien De Bue", () => {
  assert.equal(judgeHeader("Belchicken Uccle De Bue", "Rue Xavier De Bue 47 Uccle", "de-bue", IDS).verdict, "own");
  assert.equal(judgeHeader("Belchicken Uccle De Bue", null, "de-bue", IDS).verdict, "own");
});

test("De Bue : numéro mal lu (67 au lieu de 47) — le nom suffit encore", () => {
  assert.equal(judgeHeader("Belchicken Uccle De Bue", "Rue Xavier De Bue 67 Uccle", "de-bue", IDS).verdict, "own");
});

test("un ticket d'Ixelles présenté à Kraainem est un autre établissement", () => {
  const r = judgeHeader("Belchicken Ixelles", "Chau. d'Ixelles 23 Ixelles", "kraainem", IDS);
  assert.deepEqual(r, { verdict: "other", matched: "ixelles" });
});

test("un ticket de Houba présenté à De Bue : autre établissement, même sans nom lu", () => {
  assert.equal(judgeHeader(null, "Houba de Strooperlaan 96", "de-bue", IDS).verdict, "other");
});

test("seule la marque est lue (« Belchicken ») : inconnu, on retombe sur le code", () => {
  assert.equal(judgeHeader("Belchicken", null, "kraainem", IDS).verdict, "unknown");
});

test("rien de lu : inconnu", () => {
  assert.equal(judgeHeader(null, null, "kraainem", IDS).verdict, "unknown");
  assert.equal(judgeHeader("  ", "", "kraainem", IDS).verdict, "unknown");
});

test("un restaurant que nous ne connaissons pas : inconnu, jamais refusé sur ce seul motif", () => {
  assert.equal(judgeHeader("Pizza Roma", "Rue de la Loi 16", "kraainem", IDS).verdict, "unknown");
});

test("même numéro de rue ailleurs ne suffit pas : il faut aussi un mot de la rue", () => {
  assert.equal(judgeHeader(null, "Rue Haute 185", "kraainem", IDS).verdict, "unknown");
});

test("un en-tête qui désignerait deux établissements est ambigu : inconnu", () => {
  assert.equal(judgeHeader("Belchicken Kraainem Houba", null, "kraainem", IDS).verdict, "unknown");
});
