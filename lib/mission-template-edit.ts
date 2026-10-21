// ============================================================
// Réserver un prestataire (ADR 0084 §5 duodecies) — modifier un questionnaire depuis la plateforme, sans casser le code.
//
// Le questionnaire d'un métier est une donnée (`brief_templates`), mais le code lit certaines clés et certaines options en dur
// (la cuisine dans le message à l'équipe, « Prêt à imprimer » dans le contrôle des fichiers, les formats pour les budgets).
// Ce qui se règle ici : le LIBELLÉ, l'AIDE, et les OPTIONS d'une question à choix. Ce qui ne se règle jamais ici : les clés, le type,
// le caractère obligatoire, la phase, l'ordre, le nombre de questions. Les options des questions que le code lit en dur sont
// verrouillées. Fonctions PURES, importables par le navigateur.
// ============================================================

import type { BriefQuestion } from "./mission-brief";
import { maskContacts } from "./mission-messages";

export const LABEL_MIN = 3;
export const LABEL_MAX = 120;
export const HINT_MAX = 300;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 12;
export const OPTION_MAX = 60;

/** Questions dont le code lit les options en dur : les renommer casserait un comportement. */
export const LOCKED_OPTIONS: readonly string[] = ["kitchen", "file_state", "format", "deciders_attested"];

export type QuestionEdit = { key: string; label: string; hint: string; options?: string[] };
export type EditIssueCode = "unknown_key" | "duplicate_key" | "label_length" | "hint_too_long" | "options_count" | "option_length" | "option_duplicate" | "options_locked" | "options_not_allowed" | "contact_in_text";
export type EditIssue = { key: string; code: EditIssueCode };

const hasOptions = (q: BriefQuestion) => q.kind === "choice" || q.kind === "multi";

export const optionsAreLocked = (q: BriefQuestion): boolean => LOCKED_OPTIONS.includes(q.key);

// Un texte trop long garde un caractère de trop pour que la validation le refuse (aucune coupe silencieuse).
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max + 1) : "");

export function sanitizeEdits(raw: unknown): QuestionEdit[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.slice(0, 80).map((e) => {
    const o = e && typeof e === "object" ? (e as Record<string, unknown>) : {};
    return {
      key: typeof o.key === "string" ? o.key : "",
      label: clean(o.label, LABEL_MAX),
      hint: clean(o.hint, HINT_MAX),
      options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === "string").map((x) => clean(x, OPTION_MAX)).filter(Boolean).slice(0, OPTIONS_MAX + 1) : undefined,
    };
  });
}

/** Applique les modifications à une copie des questions. Rien n'est appliqué à moitié : au moindre refus, aucune question ne change. */
export function applyEdits(questions: readonly BriefQuestion[], edits: readonly QuestionEdit[]): { ok: true; questions: BriefQuestion[]; changed: number } | { ok: false; issues: EditIssue[] } {
  const issues: EditIssue[] = [];
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const seen = new Set<string>();
  for (const e of edits) {
    const q = byKey.get(e.key);
    if (!q) {
      issues.push({ key: e.key, code: "unknown_key" });
      continue;
    }
    if (seen.has(e.key)) {
      issues.push({ key: e.key, code: "duplicate_key" });
      continue;
    }
    seen.add(e.key);
    if (e.label.length < LABEL_MIN || e.label.length > LABEL_MAX) issues.push({ key: e.key, code: "label_length" });
    if (e.hint.length > HINT_MAX) issues.push({ key: e.key, code: "hint_too_long" });
    if (maskContacts(`${e.label} ${e.hint}`).masked) issues.push({ key: e.key, code: "contact_in_text" });
    if (e.options !== undefined) {
      const current = q.options ?? [];
      const same = e.options.length === current.length && e.options.every((o, i) => o === current[i]);
      if (!hasOptions(q)) {
        if (e.options.length > 0) issues.push({ key: e.key, code: "options_not_allowed" });
      } else if (!same) {
        if (optionsAreLocked(q)) issues.push({ key: e.key, code: "options_locked" });
        else if (e.options.length < OPTIONS_MIN || e.options.length > OPTIONS_MAX) issues.push({ key: e.key, code: "options_count" });
        else if (e.options.some((o) => o.length > OPTION_MAX)) issues.push({ key: e.key, code: "option_length" });
        else if (new Set(e.options.map((o) => o.toLowerCase())).size !== e.options.length) issues.push({ key: e.key, code: "option_duplicate" });
        else if (e.options.some((o) => maskContacts(o).masked)) issues.push({ key: e.key, code: "contact_in_text" });
      }
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  let changed = 0;
  const next = questions.map((q) => {
    const e = edits.find((x) => x.key === q.key);
    if (!e) return q;
    const hint = e.hint === "" ? undefined : e.hint;
    const options = hasOptions(q) && e.options !== undefined && !optionsAreLocked(q) ? e.options : q.options;
    const out: BriefQuestion = { ...q, label: e.label, hint, options };
    if (hint === undefined) delete out.hint;
    if (options === undefined) delete out.options;
    if (JSON.stringify(out) !== JSON.stringify(q)) changed++;
    return out;
  });
  return { ok: true, questions: next, changed };
}

export const EDIT_ISSUE_TEXT: Record<EditIssueCode, string> = {
  unknown_key: "Cette question n'existe pas dans le questionnaire.",
  duplicate_key: "Cette question est envoyée deux fois.",
  label_length: `La question doit faire entre ${LABEL_MIN} et ${LABEL_MAX} caractères.`,
  hint_too_long: `L'aide est trop longue (${HINT_MAX} caractères au plus).`,
  options_count: `Une question à choix a entre ${OPTIONS_MIN} et ${OPTIONS_MAX} options.`,
  option_length: `Une option fait ${OPTION_MAX} caractères au plus.`,
  option_duplicate: "Deux options sont identiques.",
  options_locked: "Les options de cette question sont lues par le code : elles ne se changent pas ici.",
  options_not_allowed: "Cette question n'a pas d'options.",
  contact_in_text: "Pas de numéro, d'e-mail ni de lien de messagerie dans un questionnaire.",
};
