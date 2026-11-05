import { test } from "node:test";
import assert from "node:assert/strict";
import { caReminderIdea, notesCa, NOTES_CA_WINDOW_DAYS, type ChloeCaInput } from "./chloe-ca";

// Jeudi 5 novembre 2026 : hier est le mercredi 4 (getUTCDay = 3).
const TODAY = "2026-11-05";
const YESTERDAY = "2026-11-04";

function input(over: Partial<ChloeCaInput> = {}): ChloeCaInput {
  return {
    restaurantId: "demo-x",
    todayISO: TODAY,
    // L'établissement note son CA : lundi et mardi sont faits, hier manque.
    covered: new Set(["2026-11-02", "2026-11-03"]),
    closing: null,
    remindersOn: false,
    ...over,
  };
}

test("hier n'est pas noté et l'établissement note son CA : une idée qui ouvre la saisie d'hier", () => {
  const idea = caReminderIdea(input());
  assert.ok(idea);
  assert.equal(idea.assistant, "chloe");
  assert.equal(idea.type, "ca_du_jour_a_noter");
  assert.equal(idea.title, "Tu n'as pas noté hier");
  assert.equal(idea.question, "30 secondes ?");
  assert.deepEqual(idea.action, { kind: "open", path: `/admin/demo-x/ca/${YESTERDAY}`, label: "Saisir" });
  assert.match(idea.lines.what, /mercredi 4/);
  assert.equal(idea.estimate, null); // un rappel ne promet aucun gain
  assert.equal(idea.decideBy, TODAY);
});

test("hier est déjà noté : rien à rappeler", () => {
  assert.equal(caReminderIdea(input({ covered: new Set(["2026-11-03", YESTERDAY]) })), null);
});

test("hier est noté « fermé » (un jour couvert) : rien à rappeler", () => {
  // Un jour fermé entre dans `covered` comme un jour avec chiffre (ADR 0078 §4).
  assert.equal(caReminderIdea(input({ covered: new Set(["2026-11-02", YESTERDAY]) })), null);
});

test("jamais une relance à un établissement qui n'a rien noté et dont les rappels sont éteints", () => {
  assert.equal(caReminderIdea(input({ covered: new Set() })), null);
  // Un seul jour noté, mais il y a 40 jours : l'habitude est perdue (fenêtre de 28 jours).
  assert.equal(caReminderIdea(input({ covered: new Set(["2026-09-26"]) })), null);
});

test("rappels allumés : on relance même si rien n'a encore été noté", () => {
  const idea = caReminderIdea(input({ covered: new Set(), remindersOn: true }));
  assert.ok(idea);
  assert.deepEqual(idea.evidence.notedLast14, 0);
});

test("jour de fermeture habituel : on ne rappelle pas un CA qui n'existe pas", () => {
  // Fermé le mercredi (index 3), ouvert les autres jours jusqu'à 23 h 30.
  const closedOnWednesday = [1410, 1410, 1410, null, 1410, 1410, 1410];
  assert.equal(caReminderIdea(input({ closing: closedOnWednesday })), null);
  // Le même établissement, ouvert le mercredi : l'idée revient.
  assert.ok(caReminderIdea(input({ closing: [1410, 1410, 1410, 1410, 1410, 1410, 1410] })));
});

test("horaires inconnus : heure par défaut, l'idée reste proposée", () => {
  assert.ok(caReminderIdea(input({ closing: null })));
});

test("seul hier compte : un autre jour manquant ne déclenche rien tant qu'hier est noté", () => {
  // Lundi manque, hier (mercredi) est noté : l'accueil a sa ligne « À faire », pas Chloé.
  assert.equal(caReminderIdea(input({ covered: new Set(["2026-11-03", YESTERDAY]) })), null);
});

test("la trace garde les jours notés sur 14 jours et les jours manquants sur 7", () => {
  const idea = caReminderIdea(input({ covered: new Set(["2026-11-03", "2026-11-02", "2026-10-30", "2026-10-01"]) }));
  assert.ok(idea);
  // 11-03, 11-02 et 10-30 sont dans les 14 derniers jours ; 10-01 est plus ancien.
  assert.equal(idea.evidence.notedLast14, 3);
  // 7 jours en arrière depuis le 5 novembre : le 4, le 1er, le 31 et le 29 octobre manquent.
  assert.deepEqual(idea.evidence.missing7, [YESTERDAY, "2026-11-01", "2026-10-31", "2026-10-29"]);
  assert.equal(idea.evidence.day, YESTERDAY);
});

test("règle « note son CA » : un jour noté il y a exactement 28 jours compte, 29 non", () => {
  const edge = "2026-10-08"; // 28 jours avant le 5 novembre
  assert.equal(NOTES_CA_WINDOW_DAYS, 28);
  assert.equal(notesCa(new Set([edge]), TODAY, false), true);
  assert.equal(notesCa(new Set(["2026-10-07"]), TODAY, false), false);
  assert.equal(notesCa(new Set(), TODAY, true), true);
});
