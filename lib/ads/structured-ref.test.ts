import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeStructuredRef, parseStructuredRef, structuredRef } from "./structured-ref";

test("communication d'une demande : code client + numéro, clé modulo 97", () => {
  // Clés vérifiées à part : 20000001 % 97 = 56, 10000001 % 97 = 77, 10000012 % 97 = 88.
  assert.equal(structuredRef("BE002", 1), "+++002/0000/00156+++");
  assert.equal(structuredRef("BE001", 1), "+++001/0000/00177+++");
  assert.equal(structuredRef("BE001", 12), "+++001/0000/01288+++");
});

test("reste nul : la clé vaut 97", () => {
  // 0000000097 % 97 = 0 → clé 97.
  assert.equal(parseStructuredRef("000/0000/09797"), "+++000/0000/09797+++");
});

test("relecture d'un relevé : +++, ***, espaces, sans séparateurs", () => {
  for (const s of ["+++002/0000/00156+++", "***002/0000/00156***", "002 0000 00156", "002000000156"]) {
    assert.equal(parseStructuredRef(s), "+++002/0000/00156+++", s);
  }
});

test("clé fausse ou longueur fausse : rejetée", () => {
  assert.equal(parseStructuredRef("+++002/0000/00157+++"), null);
  assert.equal(parseStructuredRef("+++002/0000/0015+++"), null);
  assert.equal(parseStructuredRef("facture 12"), null);
});

test("décodage : code client et numéro de demande", () => {
  assert.deepEqual(decodeStructuredRef("+++001/0000/01288+++"), { clientCode: "BE001", requestSeq: 12 });
  assert.equal(decodeStructuredRef("+++001/0000/01289+++"), null);
});

test("entrées invalides refusées", () => {
  assert.throws(() => structuredRef("B0042", 1));
  assert.throws(() => structuredRef("BE001", 0), RangeError);
  assert.throws(() => structuredRef("BE001", 10_000_000), RangeError);
});
