import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMissingCoAssignationColumn,
  normalizeOwners,
  pendingOwners,
  statusAfterValidation,
  validatedOwners,
  type BacklogValidation,
} from "./backlog-model";

const at = (d: string): BacklogValidation => ({ at: `2026-09-0${d}T10:00:00.000Z`, by: null });

test("normalizeOwners : trim, dédoublonnage, associés d'abord puis noms hérités", () => {
  assert.deepEqual(normalizeOwners([" Omar ", "Mehdi", "Omar", "", null, "associé"]), [
    "Mehdi",
    "Omar",
    "associé",
  ]);
  assert.deepEqual(normalizeOwners([]), []);
});

test("une action co-attribuée n'est pas faite tant que tout le monde n'a pas validé", () => {
  const owners = ["Mehdi", "Omar"];
  assert.equal(statusAfterValidation("en_cours", owners, { Mehdi: at("6") }), "en_cours");
  assert.equal(statusAfterValidation("en_cours", owners, { Mehdi: at("6"), Omar: at("7") }), "fait");
});

test("retirer sa validation rouvre l'action, ajouter quelqu'un aussi", () => {
  assert.equal(statusAfterValidation("fait", ["Mehdi", "Omar"], { Mehdi: at("6") }), "en_cours");
  // Personne validée sur une action déjà close → elle repasse en cours.
  assert.equal(statusAfterValidation("fait", ["Mehdi", "Omar"], {}), "en_cours");
});

test("une seule personne attribuée : son « Fait » clôt l'action", () => {
  assert.equal(statusAfterValidation("a_faire", ["Mehdi"], { Mehdi: at("6") }), "fait");
  assert.equal(statusAfterValidation("a_faire", ["Mehdi"], {}), "a_faire");
});

test("sans personne attribuée, le statut reste piloté à la main", () => {
  assert.equal(statusAfterValidation("fait", [], {}), "fait");
  assert.equal(statusAfterValidation("idee", [], { Mehdi: at("6") }), "idee");
});

test("« abandonné » n'est jamais ressuscité par une validation", () => {
  assert.equal(statusAfterValidation("abandonne", ["Mehdi"], { Mehdi: at("6") }), "abandonne");
});

test("une validation orpheline (personne retirée de l'attribution) ne compte pas", () => {
  const item = { owners: ["Omar"], validations: { Mehdi: at("6") } };
  assert.deepEqual(validatedOwners(item), []);
  assert.deepEqual(pendingOwners(item), ["Omar"]);
  assert.equal(statusAfterValidation("en_cours", item.owners, item.validations), "en_cours");
});

test("ré-attribuer quelqu'un restaure sa validation telle quelle", () => {
  const validations = { Mehdi: at("6") };
  assert.deepEqual(validatedOwners({ owners: ["Mehdi", "Omar"], validations }), ["Mehdi"]);
  assert.equal(statusAfterValidation("en_cours", ["Mehdi"], validations), "fait");
});

test("isMissingCoAssignationColumn : lecture (42703) et écriture (schema cache) reconnues", () => {
  assert.equal(isMissingCoAssignationColumn({ code: "42703", message: "column platform_backlog.owners does not exist" }), true);
  assert.equal(
    isMissingCoAssignationColumn({ code: "PGRST204", message: "Could not find the 'validations' column of 'platform_backlog' in the schema cache" }),
    true
  );
  assert.equal(isMissingCoAssignationColumn({ code: "23514", message: "violates check constraint" }), false);
  assert.equal(isMissingCoAssignationColumn(null), false);
});
