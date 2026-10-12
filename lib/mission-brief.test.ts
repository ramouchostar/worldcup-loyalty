import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESIGN_NOTE_CATEGORIES,
  VIDEO_NOTE_CATEGORIES,
  VIDEO_TEMPLATE,
  checkRetouchNote,
  checkRetouchRound,
  earliestShootDate,
  phoneLooksValid,
  reminderDates,
  shootSlots,
  validateBrief,
  type BriefAnswers,
} from "./mission-brief";

const TODAY = "2026-10-09";

const complete: BriefAnswers = {
  goal: "Nouveau plat",
  format: "Reels",
  idea: "Présenter le nouveau burger signature, sans fioriture.",
  dishes: ["Burger signature"],
  kitchen: "Non",
  sound: "Non",
  tone: "Gourmand",
  shoot_date: "2026-10-20",
  shoot_slot: "09:30",
  roles: ["Cuisinier"],
  contact: { name: "Karim", phone: "0470 12 34 56" },
  deciders: ["Moi seul"],
  deciders_attested: true,
  budget_cents: 80_000,
};

const codes = (a: BriefAnswers, t = VIDEO_TEMPLATE) => validateBrief(a, t, TODAY).issues.map((i) => `${i.key}:${i.code}`);

test("un brief complet part", () => {
  const v = validateBrief(complete, VIDEO_TEMPLATE, TODAY);
  assert.equal(v.ok, true);
  assert.deepEqual(v.issues, []);
});

test("un brief vide est refusé champ par champ, chaque refus nommé", () => {
  const issues = validateBrief({}, VIDEO_TEMPLATE, TODAY).issues;
  const required = VIDEO_TEMPLATE.questions.filter((q) => q.required).map((q) => q.key);
  assert.deepEqual(issues.map((i) => i.key).sort(), required.sort());
  assert.ok(issues.every((i) => i.code === "missing" || i.code === "not_attested"));
});

test("le tournage se prévoit au moins 7 jours à l'avance", () => {
  assert.equal(earliestShootDate(TODAY), "2026-10-16");
  assert.deepEqual(codes({ ...complete, shoot_date: "2026-10-15" }), ["shoot_date:too_soon"]);
  assert.deepEqual(codes({ ...complete, shoot_date: "2026-10-16" }), []);
  assert.deepEqual(codes({ ...complete, shoot_date: "2026-10-01" }), ["shoot_date:past"]);
});

test("l'idée doit être développée (2 phrases, pas « un reel »)", () => {
  assert.deepEqual(codes({ ...complete, idea: "Un reel." }), ["idea:too_short"]);
  assert.deepEqual(codes({ ...complete, idea: "     " }), ["idea:missing"]);
});

test("la décision engage tous les décideurs : sans attestation, pas d'envoi", () => {
  assert.deepEqual(codes({ ...complete, deciders_attested: false }), ["deciders_attested:not_attested"]);
  assert.deepEqual(codes({ ...complete, deciders: [] }), ["deciders:missing"]);
});

test("un seul contact sur place, avec un vrai téléphone", () => {
  assert.deepEqual(codes({ ...complete, contact: { name: "", phone: "0470123456" } }), ["contact:missing"]);
  assert.deepEqual(codes({ ...complete, contact: { name: "Karim", phone: "12" } }), ["contact:bad_phone"]);
  assert.equal(phoneLooksValid("+32 470 12 34 56"), true);
  assert.equal(phoneLooksValid("abc"), false);
});

test("une réponse hors liste est refusée", () => {
  assert.deepEqual(codes({ ...complete, kitchen: "Peut-être" }), ["kitchen:bad_option"]);
  assert.deepEqual(codes({ ...complete, roles: ["Plongeur"] }), ["roles:bad_option"]);
});

test("budget plancher : refus ; ambition irréaliste : avertissement seulement", () => {
  const t = { ...VIDEO_TEMPLATE, budgetFloorCents: 50_000, ambitionBudgetCents: { Film: 300_000 } };
  assert.deepEqual(codes({ ...complete, budget_cents: 40_000 }, t), ["budget_cents:budget_below_floor"]);
  const v = validateBrief({ ...complete, format: "Film", budget_cents: 80_000 }, t, TODAY);
  assert.equal(v.ok, true);
  assert.deepEqual(v.warnings, [{ code: "ambition_vs_budget", format: "Film" }]);
  assert.deepEqual(validateBrief({ ...complete, format: "Reels" }, t, TODAY).warnings, []);
});

test("sans plancher configuré, aucun budget n'est refusé pour son montant", () => {
  assert.deepEqual(codes({ ...complete, budget_cents: 1 }), []);
});

// ── Créneaux ──
test("semaine : avant le lunch et entre lunch et dîner conseillés, le service du soir déconseillé", () => {
  const s = shootSlots("2026-10-20"); // mardi
  assert.deepEqual(s.map((x) => x.advice), ["recommended", "recommended", "discouraged"]);
  assert.equal(s[2].start, "18:30");
});

test("week-end : le rush du soir est déconseillé", () => {
  const s = shootSlots("2026-10-24"); // samedi
  assert.equal(s[0].tag, "Avant l'ouverture");
  assert.equal(s[2].advice, "discouraged");
  assert.equal(s[2].tag, "Rush du week-end");
});

test("en hiver, un créneau de soir prévient que la lumière a disparu ; en été, non", () => {
  assert.deepEqual(shootSlots("2026-12-10").map((s) => s.darkWarning), [false, false, true]);
  assert.deepEqual(shootSlots("2026-07-10").map((s) => s.darkWarning), [false, false, false]);
});

// ── Rappels ──
test("rappels : J-7, J-2 et la veille", () => {
  assert.deepEqual(reminderDates("2026-10-20"), [
    { key: "j7", date: "2026-10-13" },
    { key: "j2", date: "2026-10-18" },
    { key: "veille", date: "2026-10-19" },
  ]);
});

// ── Remarques ──
test("« je n'aime pas » seul est refusé, il faut une catégorie et une raison", () => {
  const c = VIDEO_NOTE_CATEGORIES;
  assert.equal(checkRetouchNote({ category: null, text: "trop sombre, on ne voit pas la sauce" }, c), "no_category");
  assert.equal(checkRetouchNote({ category: "Lumière", text: "" }, c), "empty");
  assert.equal(checkRetouchNote({ category: "Lumière", text: "J'aime pas" }, c), "vague");
  assert.equal(checkRetouchNote({ category: "Lumière", text: "Bof." }, c), "vague");
  assert.equal(checkRetouchNote({ category: "Lumière", text: "trop sombre" }, c), "too_short");
  assert.equal(checkRetouchNote({ category: "Lumière", text: "trop sombre, on ne voit pas la sauce" }, c), null);
  assert.equal(checkRetouchNote({ category: "Prix", text: "le prix du menu enfant est faux" }, c), "no_category"); // « Prix » n'est pas une catégorie vidéo
  assert.equal(checkRetouchNote({ category: "Prix", text: "le prix du menu enfant est faux" }, DESIGN_NOTE_CATEGORIES), null);
});

test("un tour de retours : au moins une remarque, toutes valables, envoyées en une fois", () => {
  const c = VIDEO_NOTE_CATEGORIES;
  assert.deepEqual(checkRetouchRound([], c), { ok: false, problems: [], empty: true });
  const r = checkRetouchRound(
    [
      { category: "Rythme", text: "plan du burger trop court, garde-le 2 s de plus" },
      { category: null, text: "logo trop petit au début" },
    ],
    c,
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems, [{ index: 1, issue: "no_category" }]);
});
