import { test } from "node:test";
import assert from "node:assert/strict";
import { fr } from "./messages/fr";
import { optionText, questionText, stepText } from "./questionnaire";
import { NL_Q, NL_STEPS } from "./questionnaires/nl";
import { EN_Q, EN_STEPS } from "./questionnaires/en";
import { PHOTO_TEMPLATE, VIDEO_TEMPLATE, DESIGN_TEMPLATE, PRINT_TEMPLATE, stepsFor } from "../mission-brief";
import { briefHeadline, briefRows, issueMessage } from "../mission-view";
import type { Metier } from "../mission-money";

// ADR 0084 §5 terdecies — les questions d'un brief dans la langue de celui qui lit.

const TEMPLATES = [VIDEO_TEMPLATE, PHOTO_TEMPLATE, DESIGN_TEMPLATE, PRINT_TEMPLATE];
const TABLES = [["nl", NL_Q, NL_STEPS], ["en", EN_Q, EN_STEPS]] as const;

test("chaque question, chaque aide, chaque option et chaque écran des quatre questionnaires par défaut est traduit en néerlandais et en anglais", () => {
  for (const [lang, table, steps] of TABLES) {
    for (const tpl of TEMPLATES) {
      for (const q of tpl.questions) {
        const tr = table[tpl.metier][q.key];
        assert.ok(tr?.label, `${lang}:${tpl.metier}.${q.key} sans libellé`);
        if (q.hint) assert.ok(tr.hint, `${lang}:${tpl.metier}.${q.key} sans aide`);
        for (const o of q.options ?? []) assert.ok(tr.options?.[o], `${lang}:${tpl.metier}.${q.key} : option « ${o} » sans traduction`);
      }
      for (const st of stepsFor(tpl.metier)) {
        const tr = steps[`${tpl.metier}.${st.key}`];
        assert.ok(tr?.title && tr.subtitle, `${lang}:${tpl.metier}.${st.key}`);
      }
    }
  }
});

test("aucune traduction orpheline : tout ce qui est traduit existe dans le questionnaire par défaut", () => {
  for (const [lang, table, steps] of TABLES) {
    for (const tpl of TEMPLATES) {
      const keys = new Set(tpl.questions.map((q) => q.key));
      for (const key of Object.keys(table[tpl.metier])) assert.ok(keys.has(key), `${lang}:${tpl.metier}.${key} n'existe pas`);
      for (const q of tpl.questions) {
        const known = new Set(q.options ?? []);
        for (const o of Object.keys(table[tpl.metier][q.key]?.options ?? {})) assert.ok(known.has(o), `${lang}:${tpl.metier}.${q.key} : option « ${o} » inconnue`);
      }
    }
    const stepKeys = new Set(TEMPLATES.flatMap((t) => stepsFor(t.metier).map((s) => `${t.metier}.${s.key}`)));
    for (const k of Object.keys(steps)) assert.ok(stepKeys.has(k), `${lang}:${k} n'existe pas`);
  }
});

test("le français est exactement le texte du questionnaire", () => {
  const q = VIDEO_TEMPLATE.questions.find((x) => x.key === "kitchen")!;
  assert.deepEqual(questionText("fr", "video", q), { label: q.label, hint: q.hint });
  assert.equal(optionText("fr", "video", "kitchen", "Partiellement"), "Partiellement");
});

test("une question modifiée en base n'est PAS traduite (on ne devine pas le sens d'un texte modifié)", () => {
  const q = VIDEO_TEMPLATE.questions.find((x) => x.key === "tone")!;
  assert.equal(questionText("nl", "video", q).label, "Toon");
  assert.equal(questionText("nl", "video", { ...q, label: "Quel ton pour ta vidéo ?" }).label, "Quel ton pour ta vidéo ?");
  // L'aide modifiée reste, l'aide d'origine est traduite.
  const idea = VIDEO_TEMPLATE.questions.find((x) => x.key === "idea")!;
  assert.match(questionText("en", "video", idea).hint ?? "", /2 to 3 suggestions/);
  assert.equal(questionText("en", "video", { ...idea, hint: "Mon aide" }).hint, "Mon aide");
});

test("une option inconnue ou un texte libre reste tel quel", () => {
  assert.equal(optionText("nl", "video", "tone", "Chaleureux"), "Warm");
  assert.equal(optionText("nl", "video", "tone", "Un ton à moi"), "Un ton à moi");
  assert.equal(optionText("en", "video", "inconnue", "x"), "x");
});

test("les écrans de l'assistant : traduits, sauf s'ils ont été modifiés", () => {
  const st = stepsFor("design")[0];
  assert.equal(stepText("nl", "design", st).title, "Wat ontwerpen we?");
  assert.equal(stepText("nl", "design", { ...st, title: "Autre titre" }).title, "Autre titre");
  assert.equal(stepText("fr", "design", st).title, st.title);
});

test("le brief lu par le prestataire : libellés et choix dans sa langue, la réponse enregistrée intacte", () => {
  const answers = { goal: "Nouveau plat", kitchen: "Partiellement", highlights: ["Bar", "Tables"], dishes: ["Burger signature"], shoot_date: "2026-10-20" };
  const nl = briefRows(answers, VIDEO_TEMPLATE, "brief", "nl");
  const get = (rows: typeof nl, label: string) => rows.find((r) => r.label === label)?.value;
  assert.equal(get(nl, "Waarvoor?"), "Nieuw gerecht");
  assert.equal(get(nl, "De keuken tonen?"), "Gedeeltelijk");
  assert.equal(get(nl, "Te benadrukken in de zaal"), "Bar, Tafels");
  assert.equal(get(nl, "Te tonen gerechten"), "Burger signature"); // une liste libre ne se traduit pas
  assert.equal(answers.goal, "Nouveau plat");
  const frRows = briefRows(answers, VIDEO_TEMPLATE);
  assert.equal(get(frRows, "Pour quoi faire ?"), "Nouveau plat");
  assert.equal(briefHeadline(answers, "en", "video"), "New dish");
  assert.equal(briefHeadline(answers), "Nouveau plat");
  assert.equal(briefHeadline({ what: ["Flyer", "Affiche"] }, "nl", "design"), "Flyer, Affiche");
});

test("chaque motif de refus du brief a son texte dans les trois langues, et le français est celui d'avant", () => {
  const codes = ["missing", "too_short", "too_soon", "deadline_too_soon", "bad_url", "needs_detail", "past", "bad_option", "bad_phone", "not_attested", "budget_below_floor"] as const;
  for (const c of codes) {
    assert.ok(`wz.issue.${c}` in fr, c);
    assert.equal((fr as Record<string, string>)[`wz.issue.${c}`], issueMessage(c), c);
  }
});

test("chaque métier garde des clés de questions uniques, sans doublon d'écran", () => {
  for (const tpl of TEMPLATES) {
    const keys = tpl.questions.map((q) => q.key);
    assert.equal(new Set(keys).size, keys.length, tpl.metier);
    const steps = stepsFor(tpl.metier as Metier).map((s) => s.key);
    assert.equal(new Set(steps).size, steps.length, tpl.metier);
  }
});
