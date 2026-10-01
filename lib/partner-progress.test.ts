import { test } from "node:test";
import assert from "node:assert/strict";
import { isIncomplete, missingFor, missingSteps, progressTrack, type EstablishmentProgress } from "./partner-progress";

const est = (over: Partial<EstablishmentProgress>): EstablishmentProgress => ({
  id: "a", name: "A", sector: "Ixelles", status: "pending", hasMenu: false, hasTicket: false, ...over,
});

test("ce qui manque se lit dans les données", () => {
  assert.deepEqual(missingSteps(est({})), ["menu", "ticket"]);
  assert.deepEqual(missingSteps(est({ hasMenu: true })), ["ticket"]);
  assert.deepEqual(missingSteps(est({ hasMenu: true, hasTicket: true })), []);
});

test("seul un établissement en attente peut être incomplet", () => {
  assert.equal(isIncomplete(est({})), true);
  assert.equal(isIncomplete(est({ hasMenu: true, hasTicket: true })), false);
  // Un établissement déjà en ligne (créé par la plateforme, ancien) n'est jamais bloqué.
  assert.equal(isIncomplete(est({ status: "active" })), false);
});

test("ligne d'étapes : une étape n'est faite que pour tous les établissements", () => {
  const list = [est({ id: "a", hasMenu: true, hasTicket: true }), est({ id: "b", hasMenu: true })];
  const t = Object.fromEntries(progressTrack(list).map((s) => [s.key, s.state]));
  assert.equal(t.carte, "done");
  assert.equal(t.ticket, "todo");
  assert.equal(t.validation, "wait");
});

test("validation faite quand tout est en ligne", () => {
  const t = progressTrack([est({ status: "active", hasMenu: true, hasTicket: true })]);
  assert.equal(t.find((s) => s.key === "validation")?.state, "done");
});

test("établissements à compléter pour une étape", () => {
  const list = [est({ id: "a", hasMenu: true }), est({ id: "b" }), est({ id: "c", status: "active" })];
  assert.deepEqual(missingFor(list, "menu").map((e) => e.id), ["b"]);
  assert.deepEqual(missingFor(list, "ticket").map((e) => e.id), ["a", "b"]);
});
