import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeamIdea, teamIdeaType, type TeamIdeaInput } from "./team-ideas";
import { ideaKey } from "./proposals";

const TODAY = "2026-11-05";
const base: TeamIdeaInput = {
  assistant: "louis",
  title: "Trois avis Google attendent une réponse",
  question: "On y répond pour toi ?",
  what: "Trois réponses courtes et polies, que tu relis avant.",
  who: "Les clients qui ont laissé un avis cette semaine.",
  cost: "Rien.",
  decideBy: "2026-11-08",
  note: "Rédiger les 3 réponses, les envoyer au gérant sur WhatsApp, publier après accord.",
};

test("une idée d'équipe complète : même forme qu'une idée d'assistant, geste « équipe »", () => {
  const r = buildTeamIdea({ ...base, title: "  Trois avis   Google attendent une réponse " }, TODAY);
  assert.ok(r.idea);
  assert.equal(r.idea.title, "Trois avis Google attendent une réponse");
  assert.equal(r.idea.action.kind, "team");
  assert.equal(r.idea.action.label, "On y va");
  assert.equal(r.idea.estimate, null);
  assert.equal(r.idea.type, "equipe_trois_avis_google_attendent_une_reponse");
});

test("deux idées d'équipe différentes ne sont jamais des doublons ; la même, si", () => {
  const a = buildTeamIdea(base, TODAY).idea!;
  const b = buildTeamIdea({ ...base, title: "Tes photos de la fiche datent de 2021" }, TODAY).idea!;
  assert.notEqual(ideaKey(a), ideaKey(b));
  assert.equal(ideaKey(a), ideaKey(buildTeamIdea(base, TODAY).idea!));
  assert.equal(teamIdeaType("!!!"), "equipe_idee");
});

test("ce qui manque est dit, champ par champ", () => {
  const r = buildTeamIdea({ ...base, assistant: "bob", question: "", decideBy: "2026-11-01" }, TODAY);
  assert.equal(r.idea, null);
  assert.deepEqual(r.errors, ["Choisis l'assistant qui porte l'idée.", "La question : à remplir.", "La date limite est passée."]);
  assert.match(buildTeamIdea({ ...base, decideBy: "2026-12-20" }, TODAY).errors[0], /30 jours au plus/);
  assert.match(buildTeamIdea({ ...base, title: "x".repeat(91) }, TODAY).errors[0], /90 caractères au plus/);
});

test("l'estimation : une fourchette avec son unité et sa base, ou rien", () => {
  const ok = buildTeamIdea({ ...base, estimateLow: 5, estimateHigh: 12, estimateUnit: "clients de retour", estimateBasis: "Relances de septembre." }, TODAY);
  assert.deepEqual(ok.idea?.estimate, { low: 5, high: 12, unit: "clients de retour", basis: "Relances de septembre." });
  assert.ok(buildTeamIdea({ ...base, estimateLow: 5, estimateHigh: null }, TODAY).errors.some((e) => /bas ET le haut/.test(e)));
  assert.ok(buildTeamIdea({ ...base, estimateLow: 9, estimateHigh: 3, estimateUnit: "x", estimateBasis: "y" }, TODAY).errors.some((e) => /sous le haut/.test(e)));
  assert.ok(buildTeamIdea({ ...base, estimateLow: 1, estimateHigh: 3 }, TODAY).errors.some((e) => /unité/.test(e)));
});
