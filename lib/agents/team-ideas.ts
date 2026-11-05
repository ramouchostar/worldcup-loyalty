import { ASSISTANTS, type AssistantId, type Idea } from "./types";

// Une idée préparée par l'équipe (ADR 0089 §6, Brigade 04) — pur et testé.
// L'équipe écrit la carte depuis /platform/idees pour un établissement ; le
// gérant la voit exactement comme celles des assistants (même carte, même
// Oui / Non / Plus tard, mêmes règles : forfait, doublon, plafond de 3 par jour).
// Sur « Oui », rien ne s'exécute tout seul : l'idée reste « acceptée » et
// l'équipe fait le travail, puis le note (« Fait ») sur /platform/idees.

export type TeamIdeaInput = {
  assistant: string;
  title: string;
  question: string;
  what: string;
  who: string;
  cost: string;
  /** Jour de Bruxelles (YYYY-MM-DD) : au-delà, l'idée expire. */
  decideBy: string;
  /** Ce que l'équipe fera sur « Oui » (pour elle, jamais montré au gérant). */
  note: string;
  /** Le texte du bouton : « On y va » donne « Oui, on y va ». */
  label?: string;
  estimateLow?: number | null;
  estimateHigh?: number | null;
  estimateUnit?: string;
  estimateBasis?: string;
};

export const TEAM_IDEA_LIMITS = { title: 90, question: 80, line: 220, note: 500, label: 30, unit: 40, basis: 160, maxDays: 30 } as const;

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** Un type stable par sujet : deux idées d'équipe différentes ne se prennent jamais pour un doublon. */
export function teamIdeaType(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `equipe_${slug || "idee"}`;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** L'idée prête à enregistrer, ou la liste de ce qui ne va pas (en mots de l'équipe). */
export function buildTeamIdea(raw: TeamIdeaInput, todayISO: string): { idea: Idea; errors: [] } | { idea: null; errors: string[] } {
  const L = TEAM_IDEA_LIMITS;
  const errors: string[] = [];
  const assistant = raw.assistant as AssistantId;
  if (!(assistant in ASSISTANTS)) errors.push("Choisis l'assistant qui porte l'idée.");

  const title = clean(raw.title);
  const question = clean(raw.question);
  const what = clean(raw.what);
  const who = clean(raw.who);
  const cost = clean(raw.cost);
  const note = clean(raw.note);
  const label = clean(raw.label) || "On y va";
  const need = (v: string, name: string, max: number) => {
    if (!v) errors.push(`${name} : à remplir.`);
    else if (v.length > max) errors.push(`${name} : ${max} caractères au plus (${v.length}).`);
  };
  need(title, "Ce qui se passe", L.title);
  need(question, "La question", L.question);
  need(what, "Quoi", L.line);
  need(who, "Pour qui", L.line);
  need(cost, "Combien", L.line);
  need(note, "Ce que l'équipe fera", L.note);
  if (label.length > L.label) errors.push(`Le bouton : ${L.label} caractères au plus.`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.decideBy ?? "")) errors.push("La date limite est illisible.");
  else if (raw.decideBy < todayISO) errors.push("La date limite est passée.");
  else if (raw.decideBy > addDays(todayISO, L.maxDays)) errors.push(`La date limite : ${L.maxDays} jours au plus.`);

  let estimate: Idea["estimate"] = null;
  const lo = raw.estimateLow;
  const hi = raw.estimateHigh;
  const hasLo = typeof lo === "number" && Number.isFinite(lo);
  const hasHi = typeof hi === "number" && Number.isFinite(hi);
  if (hasLo || hasHi) {
    const unit = clean(raw.estimateUnit);
    const basis = clean(raw.estimateBasis);
    // Une fourchette ou rien (ADR 0089 §4) : jamais un chiffre seul, jamais sans sa base.
    if (!hasLo || !hasHi) errors.push("L'estimation : donne le bas ET le haut de la fourchette, ou rien.");
    else if (lo! < 0 || hi! < lo!) errors.push("L'estimation : le bas doit être positif et sous le haut.");
    if (!unit) errors.push("L'estimation : dis l'unité (ex. « clients de retour »).");
    else if (unit.length > L.unit) errors.push(`L'unité : ${L.unit} caractères au plus.`);
    if (!basis) errors.push("L'estimation : dis d'où vient la fourchette.");
    else if (basis.length > L.basis) errors.push(`La base de l'estimation : ${L.basis} caractères au plus.`);
    if (hasLo && hasHi) estimate = { low: lo!, high: hi!, unit, basis };
  }

  if (errors.length > 0) return { idea: null, errors };
  return {
    idea: {
      assistant,
      type: teamIdeaType(title),
      title,
      question,
      lines: { what, who, cost },
      estimate,
      decideBy: raw.decideBy,
      action: { kind: "team", note, label },
      evidence: { preparedBy: "equipe" },
    },
    errors: [],
  };
}
