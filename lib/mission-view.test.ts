import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSION_STATUSES } from "./mission-states";
import { VIDEO_BRIEF_STEPS, VIDEO_TEMPLATE, type BriefIssueCode } from "./mission-brief";
import { STATUS_VIEW, briefRows, centsToEurosInput, eurosToCents, issueMessage, timeline } from "./mission-view";

test("chaque état a son nom à l'écran, et un seul", () => {
  for (const s of MISSION_STATUSES) assert.ok(STATUS_VIEW[s]?.label, s);
  const labels = MISSION_STATUSES.map((s) => STATUS_VIEW[s].label);
  assert.equal(new Set(labels).size, labels.length);
});

test("la frise : un brouillon n'a rien commencé, un devis reçu a envoyé le brief", () => {
  assert.deepEqual(timeline("brief").steps.map((s) => s.state), ["todo", "todo", "todo", "todo", "todo", "todo"]);
  assert.deepEqual(timeline("envoye").steps.map((s) => s.state), ["current", "todo", "todo", "todo", "todo", "todo"]);
  assert.deepEqual(timeline("devis").steps.map((s) => s.state), ["done", "current", "todo", "todo", "todo", "todo"]);
  assert.equal(timeline("date_bloquee").steps[2].state, "current");
  assert.equal(timeline("retouche").steps[4].state, "current");
});

test("une mission terminée a toute sa frise faite", () => {
  assert.ok(timeline("verse").steps.every((s) => s.state === "done"));
});

test("annulée ou en médiation : la frise s'arrête, elle ne ment pas sur l'avancement", () => {
  for (const s of ["annule", "litige"] as const) {
    const t = timeline(s);
    assert.equal(t.stopped, true);
    assert.ok(!t.steps.some((x) => x.state === "current"));
  }
});

test("le résumé du brief suit l'ordre du questionnaire, sans les réponses vides ni les pièces jointes", () => {
  const rows = briefRows(
    {
      goal: "Nouveau plat",
      format: "Reels",
      idea: "  Présenter le burger.  ",
      dishes: ["Burger", "Frites"],
      kitchen: "Non",
      promo: "",
      deciders_attested: true,
      budget_cents: 80_000,
      files: ["a.pdf"],
    },
    VIDEO_TEMPLATE,
  );
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Pour quoi faire ?", "Quel format ?", "Ton idée en deux phrases", "Plats à montrer", "Montrer la cuisine ?", "Tous ont validé ce brief", "Budget"],
  );
  assert.equal(rows.find((r) => r.label === "Ton idée en deux phrases")!.value, "Présenter le burger.");
  assert.equal(rows.find((r) => r.label === "Plats à montrer")!.value, "Burger, Frites");
  assert.match(rows.find((r) => r.label === "Budget")!.value, /^800 €$/);
});

test("la préparation du tournage a son propre résumé (contact, date)", () => {
  const rows = briefRows({ shoot_date: "2026-10-20", contact: { name: "Karim", phone: "0470 12 34 56" }, roles: ["Cuisinier"] }, VIDEO_TEMPLATE, "tournage");
  assert.deepEqual(rows.map((r) => r.label), ["Date du tournage", "Qui doit être présent", "Contact sur place"]);
  assert.equal(rows[2].value, "Karim · 0470 12 34 56");
});

test("euros tapés → centimes", () => {
  assert.equal(eurosToCents("800"), 80_000);
  assert.equal(eurosToCents("1 200"), 120_000);
  assert.equal(eurosToCents("1200,5"), 120_050);
  assert.equal(eurosToCents("99.99 €"), 9_999);
  assert.equal(eurosToCents(""), null);
  assert.equal(eurosToCents("0"), null);
  assert.equal(eurosToCents("-5"), null);
  assert.equal(eurosToCents("12,345"), null);
  assert.equal(eurosToCents("beaucoup"), null);
});

test("centimes → champ de saisie", () => {
  assert.equal(centsToEurosInput(80_000), "800");
  assert.equal(centsToEurosInput(120_050), "1200,50");
  assert.equal(centsToEurosInput(null), "");
});

test("chaque question du brief est dans UN écran de l'assistant, dans l'ordre du questionnaire", () => {
  const inBrief = VIDEO_TEMPLATE.questions.filter((q) => (q.phase ?? "brief") === "brief" && q.kind !== "files").map((q) => q.key);
  const inSteps = VIDEO_BRIEF_STEPS.flatMap((s) => s.keys);
  assert.deepEqual(inSteps, inBrief);
  assert.equal(new Set(inSteps).size, inSteps.length);
});

test("chaque motif de refus a une phrase pour le restaurateur", () => {
  const codes: BriefIssueCode[] = ["missing", "too_short", "too_soon", "past", "bad_option", "bad_phone", "not_attested", "budget_below_floor"];
  for (const c of codes) assert.ok(issueMessage(c).length > 3, c);
  assert.equal(new Set(codes.map(issueMessage)).size, codes.length);
});
