import { test } from "node:test";
import assert from "node:assert/strict";
import { DESIGN_TEMPLATE, PHOTO_TEMPLATE, PRINT_TEMPLATE, VIDEO_TEMPLATE, type BriefQuestion } from "./mission-brief";
import { EDIT_ISSUE_TEXT, LOCKED_OPTIONS, applyEdits, optionsAreLocked, sanitizeEdits, type QuestionEdit } from "./mission-template-edit";

const Q = VIDEO_TEMPLATE.questions;
const same = (qs: readonly BriefQuestion[]): QuestionEdit[] => qs.map((q) => ({ key: q.key, label: q.label, hint: q.hint ?? "", options: q.options ? [...q.options] : undefined }));
const codes = (edits: QuestionEdit[], qs: readonly BriefQuestion[] = Q) => {
  const r = applyEdits(qs, edits);
  return r.ok ? [] : r.issues.map((i) => `${i.key}:${i.code}`);
};
const withEdit = (key: string, over: Partial<QuestionEdit>, qs: readonly BriefQuestion[] = Q) => same(qs).map((e) => (e.key === key ? { ...e, ...over } : e));

test("sans changement, rien ne change", () => {
  const r = applyEdits(Q, same(Q));
  assert.ok(r.ok);
  assert.equal(r.changed, 0);
  assert.deepEqual(r.questions, Q);
});

test("on règle le libellé, l'aide et les options ; rien d'autre ne bouge", () => {
  const r = applyEdits(Q, withEdit("tone", { label: "Quel ton pour la vidéo ?", hint: "Choisis celui qui te ressemble.", options: ["Chaleureux", "Sobre", "Festif"] }));
  assert.ok(r.ok);
  assert.equal(r.changed, 1);
  const before = Q.find((q) => q.key === "tone")!;
  const after = r.questions.find((q) => q.key === "tone")!;
  assert.equal(after.label, "Quel ton pour la vidéo ?");
  assert.deepEqual(after.options, ["Chaleureux", "Sobre", "Festif"]);
  for (const k of ["key", "kind", "required", "phase", "minLength"] as const) assert.equal(after[k], before[k], k);
  assert.deepEqual(r.questions.map((q) => q.key), Q.map((q) => q.key));
});

test("effacer l'aide la retire", () => {
  const r = applyEdits(Q, withEdit("idea", { hint: "" }));
  assert.ok(r.ok);
  assert.equal("hint" in r.questions.find((q) => q.key === "idea")!, false);
});

test("une question inconnue ou envoyée deux fois est refusée", () => {
  assert.deepEqual(codes([...same(Q), { key: "nouvelle", label: "Nouvelle question", hint: "" }]), ["nouvelle:unknown_key"]);
  assert.deepEqual(codes([...same(Q), same(Q)[0]]), [`${Q[0].key}:duplicate_key`]);
});

test("libellé trop court ou trop long, aide trop longue", () => {
  assert.deepEqual(codes(withEdit("tone", { label: "ab" })), ["tone:label_length"]);
  assert.deepEqual(codes(withEdit("tone", { label: "a".repeat(121) })), ["tone:label_length"]);
  assert.deepEqual(codes(withEdit("tone", { hint: "a".repeat(301) })), ["tone:hint_too_long"]);
});

test("les options : de 2 à 12, courtes, sans doublon", () => {
  assert.deepEqual(codes(withEdit("tone", { options: ["Seule"] })), ["tone:options_count"]);
  assert.deepEqual(codes(withEdit("tone", { options: Array.from({ length: 13 }, (_, i) => `Option ${i}`) })), ["tone:options_count"]);
  assert.deepEqual(codes(withEdit("tone", { options: ["Chaleureux", "x".repeat(61)] })), ["tone:option_length"]);
  assert.deepEqual(codes(withEdit("tone", { options: ["Sobre", "sobre"] })), ["tone:option_duplicate"]);
});

test("les options lues par le code sont verrouillées, leur libellé reste libre", () => {
  assert.deepEqual(codes(withEdit("kitchen", { options: ["Oui", "Non"] })), ["kitchen:options_locked"]);
  assert.deepEqual(codes(withEdit("format", { options: ["Reels", "Autre"] })), ["format:options_locked"]);
  assert.deepEqual(codes(withEdit("file_state", { options: ["A", "B"] }, PRINT_TEMPLATE.questions), PRINT_TEMPLATE.questions), ["file_state:options_locked"]);
  assert.deepEqual(codes(withEdit("kitchen", { label: "Montrer la cuisine à l'image ?" })), []);
  assert.ok(optionsAreLocked(Q.find((q) => q.key === "kitchen")!));
});

test("pas d'options sur une question sans options", () => {
  assert.deepEqual(codes(withEdit("idea", { options: ["Oui", "Non"] })), ["idea:options_not_allowed"]);
});

test("pas de coordonnées dans un questionnaire", () => {
  assert.deepEqual(codes(withEdit("idea", { hint: "Écris à moi@exemple.be" })), ["idea:contact_in_text"]);
  assert.deepEqual(codes(withEdit("tone", { options: ["Chaleureux", "Appelle 0470 12 34 56"] })), ["tone:contact_in_text"]);
});

test("au moindre refus, rien n'est appliqué", () => {
  const r = applyEdits(Q, withEdit("tone", { label: "ab" }).map((e) => (e.key === "idea" ? { ...e, label: "Une idée en deux phrases" } : e)));
  assert.equal(r.ok, false);
});

test("sanitizeEdits ne plante sur aucune entrée et rogne les espaces", () => {
  for (const raw of [null, undefined, 3, "x", {}, [null, 3, {}]]) assert.doesNotThrow(() => sanitizeEdits(raw));
  const [e] = sanitizeEdits([{ key: "tone", label: "  Quel   ton ?  ", hint: " a  b ", options: [" A ", "", "B"] }]);
  assert.deepEqual(e, { key: "tone", label: "Quel ton ?", hint: "a b", options: ["A", "B"] });
});

test("chaque questionnaire du code passe tel quel, et tout refus a sa phrase", () => {
  for (const t of [VIDEO_TEMPLATE, PHOTO_TEMPLATE, DESIGN_TEMPLATE, PRINT_TEMPLATE]) assert.ok(applyEdits(t.questions, same(t.questions)).ok, t.metier);
  for (const t of Object.values(EDIT_ISSUE_TEXT)) assert.ok(t.length > 10);
  assert.ok(LOCKED_OPTIONS.length > 0);
});
