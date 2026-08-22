import { test } from "node:test";
import assert from "node:assert/strict";
import { describeUploadFailure, formatMb, MAX_UPLOAD_BYTES } from "./receipt-upload-errors";

test("413 Vercel (photo trop lourde) → message vrai et actionnable, jamais « erreur réseau »", () => {
  const msg = describeUploadFailure(413, null);
  assert.match(msg, /trop lourde/);
  assert.doesNotMatch(msg, /réseau/);
});

test("429 rate-limit → message d'attente", () => {
  assert.match(describeUploadFailure(429, "Trop de scans"), /Attends/);
});

test("400 avec message serveur → message serveur tel quel", () => {
  assert.equal(describeUploadFailure(400, "  Montant invalide. "), "Montant invalide.");
});

test("5xx sans message → message serveur générique", () => {
  assert.match(describeUploadFailure(500, null), /serveur/);
  assert.match(describeUploadFailure(502, null), /trop de temps/);
});

test("502 AVEC message serveur (notre JSON : OCR illisible) → le message serveur prime", () => {
  assert.equal(
    describeUploadFailure(502, "Erreur lors de l'analyse de l'image. Réessaie avec une photo plus nette."),
    "Erreur lors de l'analyse de l'image. Réessaie avec une photo plus nette."
  );
});

test("plafond d'upload sous la limite Vercel de 4,5 Mo", () => {
  assert.ok(MAX_UPLOAD_BYTES < 4.5 * 1024 * 1024);
  assert.equal(formatMb(6 * 1024 * 1024), "6,0 Mo");
});
