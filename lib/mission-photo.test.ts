import { test } from "node:test";
import assert from "node:assert/strict";
import { PHOTO_BRIEF_STEPS, PHOTO_NOTE_CATEGORIES, PHOTO_TEMPLATE, VIDEO_TEMPLATE, defaultTemplate, stepsFor, validateBrief, type BriefAnswers, type BriefPhase } from "./mission-brief";
import { briefHeadline } from "./mission-view";
import { categoriesFor } from "./mission-retouch";
import { familyOf, hasShoot } from "./mission-metier";
import { rulesKindOf } from "./mission-rules";

const TODAY = "2026-10-09";
const complete: BriefAnswers = {
  goal: "Carte et menu",
  shots: ["Plats", "Salle"],
  count: "20",
  idea: "Des photos de la nouvelle carte, lumière naturelle.",
  dishes: ["Burger signature", "Tarte du jour"],
  style: "Naturel",
  people: "L'équipe seulement",
  shoot_date: "2026-10-20",
  shoot_slot: "09:30",
  roles: ["Cuisinier"],
  contact: { name: "Karim", phone: "0470 12 34 56" },
  deciders: ["Moi seul"],
  deciders_attested: true,
  budget_cents: 60_000,
};
const check = (a: BriefAnswers, phase: BriefPhase = "brief") => validateBrief(a, PHOTO_TEMPLATE, TODAY, phase).issues.map((i) => `${i.key}:${i.code}`);

test("le photographe a son modèle et son assistant", () => {
  assert.equal(defaultTemplate("photo"), PHOTO_TEMPLATE);
  assert.equal(stepsFor("photo"), PHOTO_BRIEF_STEPS);
  assert.equal(PHOTO_TEMPLATE.metier, "photo");
});

test("chaque étape de l'assistant pointe vers des questions du brief, et toutes les questions du brief sont posées", () => {
  const brief = PHOTO_TEMPLATE.questions.filter((q) => (q.phase ?? "brief") === "brief").map((q) => q.key);
  const inSteps = PHOTO_BRIEF_STEPS.flatMap((s) => s.keys);
  assert.deepEqual(inSteps, brief.filter((k) => k !== "files"));
  assert.equal(new Set(inSteps).size, inSteps.length);
});

test("un brief photo complet part ; la séance a les mêmes clés que le tournage vidéo", () => {
  assert.deepEqual(check(complete), []);
  assert.deepEqual(check(complete, "tournage"), []);
  const keys = (t: typeof PHOTO_TEMPLATE) => t.questions.filter((q) => q.phase === "tournage").map((q) => q.key).sort();
  assert.deepEqual(keys(PHOTO_TEMPLATE), keys(VIDEO_TEMPLATE));
});

test("ce qui manque est dit", () => {
  const { shots, count, ...rest } = complete;
  void shots;
  void count;
  assert.deepEqual(check(rest).sort(), ["count:missing", "shots:missing"]);
  assert.ok(check({ ...complete, deciders_attested: false }).includes("deciders_attested:not_attested"));
});

test("le titre court d'un brief photo est son but", () => {
  assert.equal(briefHeadline(complete), "Carte et menu");
});

test("la photo suit la famille du tournage, avec ses propres catégories de retours", () => {
  assert.equal(familyOf("photo"), "tournage");
  assert.equal(hasShoot("photo"), true);
  assert.equal(rulesKindOf("photo"), "tournage");
  assert.equal(categoriesFor("photo"), PHOTO_NOTE_CATEGORIES);
  for (const c of ["Musique", "Son", "Rythme"]) assert.ok(!(PHOTO_NOTE_CATEGORIES as readonly string[]).includes(c), c);
});
