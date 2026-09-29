import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStoreCode, storeCodeOf } from "./receipt-key-store";
import { LEGACY_BESTELNUMMER_CONFIG, compileKeyPattern } from "./receipt-config";

test("le code de l'établissement est le groupe du milieu", () => {
  assert.equal(storeCodeOf("2026-09-20/223/01645"), "223");
  assert.equal(storeCodeOf("2026-09-17/258/036"), "258");
  assert.equal(storeCodeOf("2026-09-27/223/0121"), "223");
});

test("pas de code si la clé n'a pas la forme date / code / numéro", () => {
  assert.equal(storeCodeOf(null), null);
  assert.equal(storeCodeOf(""), null);
  assert.equal(storeCodeOf("01645"), null);
  assert.equal(storeCodeOf("2026-09-20/22/01645"), null);
});

test("Kraainem : son propre code passe", () => {
  assert.equal(checkStoreCode("2026-09-20/223/01645", "223", ["258"]), "ok");
});

test("Kraainem : un ticket de Houba (T135, validé à tort le 2026-09-17) est reconnu comme venant d'ailleurs", () => {
  assert.equal(checkStoreCode("2026-09-17/258/06897", "223", ["258"]), "other_establishment");
});

test("Kraainem : un code que personne n'utilise est une lecture fausse, pas un autre restaurant", () => {
  // Cas réels de la production : 228, 233, 235, 262, 123, 206, 225, 221, 031
  for (const code of ["228", "233", "235", "262", "123", "206", "225", "221", "031"]) {
    assert.equal(checkStoreCode(`2026-09-05/${code}/06086`, "223", ["258"]), "unknown_code", code);
  }
});

test("établissement dont le code n'est pas encore connu (De Bue) : aucun contrôle, forme seule", () => {
  assert.equal(checkStoreCode("2026-09-20/999/01645", null, ["223", "258"]), "unchecked");
  assert.equal(checkStoreCode("2026-09-20/223/01645", undefined, ["223", "258"]), "unchecked");
});

test("pas de clé : rien à contrôler", () => {
  assert.equal(checkStoreCode(null, "223", ["258"]), "unchecked");
});

// ── La forme du dernier groupe (mesurée sur 92 clés distinctes, 2026-09-29) ──
// « 0 », puis un chiffre de 1 à 9, puis 1 à 3 chiffres : 3 à 5 caractères.
// Jamais un 0 en deuxième position : 0 sur 92 clés lues à l'identique par Sonnet,
// Opus et Fable ; Haiku en produisait 5 sur 141 (des zéros ajoutés à tort).
const shape = compileKeyPattern(LEGACY_BESTELNUMMER_CONFIG) as RegExp;

test("forme de la clé : les trois longueurs réelles passent", () => {
  assert.ok(shape.test("2026-09-17/223/036"), "3 caractères");
  assert.ok(shape.test("2026-09-27/223/0121"), "4 caractères");
  assert.ok(shape.test("2026-09-20/223/01645"), "5 caractères");
  assert.ok(shape.test("2026-09-17/258/06897"), "code de Houba : la forme seule ne dit pas l'établissement");
});

test("forme de la clé : ce qui n'existe pas est refusé", () => {
  assert.equal(shape.test("2026-09-27/223/00121"), false, "zéro ajouté en deuxième position (Haiku)");
  assert.equal(shape.test("2026-09-17/223/0036"), false, "zéro ajouté (Haiku a lu 0036 pour 036)");
  assert.equal(shape.test("2026-09-20/223/1645"), false, "ne commence pas par 0");
  assert.equal(shape.test("2026-09-20/223/016450"), false, "6 caractères : jamais vu, le nombre s'arrête à 9999");
  assert.equal(shape.test("2026-09-20/223/05"), false, "2 caractères");
  assert.equal(shape.test("2026-09-20/22/01645"), false, "code à 2 chiffres");
  assert.equal(shape.test("2026-09-20/223/0164B"), false, "lettre dans le numéro (Haiku a lu 0701B)");
});
