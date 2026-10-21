// ============================================================
// Réserver un prestataire (ADR 0084 §5 terdecies) — les questions d'un brief, dans la langue de celui qui lit.
//
// Les questionnaires sont des données (modifiables depuis la plateforme) ; leur texte par défaut est en français. Cette couche traduit PAR QUESTION :
// la clé d'une option est l'option en français, telle qu'elle est enregistrée dans les réponses. Une question dont le libellé a été modifié en base
// n'est PAS traduite (elle est affichée telle quelle : on ne devine pas le sens d'un texte modifié). La réponse enregistrée ne change jamais.
// Fonctions PURES, importables par le navigateur.
// ============================================================

import { defaultTemplate, stepsFor, type BriefQuestion, type BriefStep } from "../mission-brief";
import type { Metier } from "../mission-money";
import type { Locale } from "./core";
import type { QTable, StepTable } from "./questionnaires/types";
import { EN_Q, EN_STEPS } from "./questionnaires/en";
import { NL_Q, NL_STEPS } from "./questionnaires/nl";

const Q: Record<Exclude<Locale, "fr">, QTable> = { nl: NL_Q, en: EN_Q };
const STEPS: Record<Exclude<Locale, "fr">, StepTable> = { nl: NL_STEPS, en: EN_STEPS };

const defaultQuestion = (metier: Metier, key: string): BriefQuestion | undefined => defaultTemplate(metier)?.questions.find((q) => q.key === key);

/** Le libellé et l'aide d'une question, dans la langue du lecteur (le texte du questionnaire s'il a été modifié). */
export function questionText(locale: Locale, metier: Metier, q: Pick<BriefQuestion, "key" | "label" | "hint">): { label: string; hint?: string } {
  if (locale === "fr") return { label: q.label, hint: q.hint };
  const tr = Q[locale][metier]?.[q.key];
  const def = defaultQuestion(metier, q.key);
  if (!tr || !def || def.label !== q.label) return { label: q.label, hint: q.hint };
  return { label: tr.label, hint: q.hint === def.hint && tr.hint ? tr.hint : q.hint };
}

/** Une option (ou une réponse choisie parmi les options), dans la langue du lecteur ; une option inconnue (texte modifié, texte libre) reste telle quelle. */
export function optionText(locale: Locale, metier: Metier, key: string, option: string): string {
  if (locale === "fr") return option;
  return Q[locale][metier]?.[key]?.options?.[option] ?? option;
}

/** Le titre et le sous-titre d'un écran de l'assistant de brief. */
export function stepText(locale: Locale, metier: Metier, step: Pick<BriefStep, "key" | "title" | "subtitle">): { title: string; subtitle: string } {
  if (locale === "fr") return { title: step.title, subtitle: step.subtitle };
  const tr = STEPS[locale][`${metier}.${step.key}`];
  const def = stepsFor(metier).find((s) => s.key === step.key);
  if (!tr || !def || def.title !== step.title) return { title: step.title, subtitle: step.subtitle };
  return tr;
}
