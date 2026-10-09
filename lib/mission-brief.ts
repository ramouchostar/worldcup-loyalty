// ============================================================
// Réserver un prestataire (ADR 0084 §3, §5, §7) — le brief.
//
// Les questionnaires sont des DONNÉES (un modèle par métier, modifiable depuis
// /platform/prestataires) : ce fichier porte le modèle vidéo par défaut, la
// validation d'un brief avant verrouillage, les créneaux conseillés, les
// rappels et la qualité d'une remarque de retour. Fonctions PURES, la date du
// jour est injectée (jour belge YYYY-MM-DD).
//
// Règles issues de l'expérience de terrain (ADR 0084 Contexte) : un brief
// incomplet ne part pas, un tournage se prévoit une semaine à l'avance, une
// décision engage tous les décideurs, « je n'aime pas » n'est pas une remarque.
// ============================================================

import { addDays } from "./console-journey";

// ── Modèle de questionnaire ──────────────────────────────────

export type QuestionKind = "choice" | "multi" | "text" | "number" | "date" | "contact" | "list" | "flag" | "files";

export type BriefQuestion = {
  key: string;
  label: string;
  kind: QuestionKind;
  required: boolean;
  options?: readonly string[];
  /** Texte : longueur minimale (caractères, espaces rognés). */
  minLength?: number;
  /** Aide sous la question, en langage simple. */
  hint?: string;
};

export type BriefTemplate = {
  metier: "video" | "photo" | "design" | "impression";
  questions: readonly BriefQuestion[];
  /** Budget minimal par format (centimes) : sous ce seuil, l'envoi est refusé. */
  budgetFloorCents?: number;
  /** Budget en dessous duquel l'ambition déclarée est irréaliste : avertissement, jamais un refus. */
  ambitionBudgetCents?: Readonly<Record<string, number>>;
};

export type BriefAnswer = string | number | boolean | string[] | { name: string; phone: string } | null | undefined;
export type BriefAnswers = Record<string, BriefAnswer>;

/** Modèle vidéo par défaut (le graphisme, la photo et l'impression suivent la même forme). */
export const VIDEO_TEMPLATE: BriefTemplate = {
  metier: "video",
  questions: [
    { key: "goal", label: "Pour quoi faire ?", kind: "choice", required: true, options: ["Réseaux sociaux", "Nouveau plat", "Promotion", "Recrutement", "Ambiance du lieu"] },
    { key: "format", label: "Quel format ?", kind: "choice", required: true, options: ["Reels", "Film", "Pack mois", "Face cam"] },
    { key: "idea", label: "Ton idée en deux phrases", kind: "text", required: true, minLength: 20, hint: "Le prestataire te fera 2 à 3 propositions : décris le but, pas le montage." },
    { key: "dishes", label: "Plats à montrer", kind: "list", required: true },
    { key: "kitchen", label: "Montrer la cuisine ?", kind: "choice", required: true, options: ["Oui", "Non", "Partiellement"], hint: "Si c'est non, aucun plan en cuisine." },
    { key: "highlights", label: "À mettre en avant dans la salle", kind: "multi", required: false, options: ["Entrée", "Salle", "Tables", "Bar", "Toilettes", "Nouvelle décoration"] },
    { key: "promo", label: "Promotion à montrer", kind: "text", required: false },
    { key: "extras_count", label: "Figurants", kind: "number", required: false },
    { key: "sound", label: "Son enregistré ?", kind: "choice", required: true, options: ["Oui", "Non"] },
    { key: "noisy", label: "Appareils bruyants à couper", kind: "text", required: false },
    { key: "tone", label: "Ton", kind: "choice", required: true, options: ["Chaleureux", "Dynamique", "Sobre", "Gourmand"] },
    { key: "avoid", label: "À éviter", kind: "text", required: false },
    { key: "shoot_date", label: "Date du tournage", kind: "date", required: true, hint: "Au moins 7 jours à l'avance : ton équipe doit être prévenue." },
    { key: "shoot_slot", label: "Créneau", kind: "choice", required: true },
    { key: "roles", label: "Qui doit être présent", kind: "multi", required: true, options: ["Cuisinier", "Serveur", "Barman"] },
    { key: "contact", label: "Contact sur place", kind: "contact", required: true, hint: "Une seule personne, joignable le jour J." },
    { key: "access", label: "Accès et déchargement", kind: "text", required: false },
    { key: "deciders", label: "Qui décide avec toi ?", kind: "list", required: true, hint: "Associé, conjoint… Tous doivent avoir validé." },
    { key: "deciders_attested", label: "Tous ont validé ce brief", kind: "flag", required: true },
    { key: "budget_cents", label: "Budget", kind: "number", required: true },
    { key: "notes", label: "Précisions", kind: "text", required: false },
    { key: "files", label: "Pièces jointes", kind: "files", required: false },
  ],
};

// ── Validation ───────────────────────────────────────────────

/** Un tournage se prévoit au moins une semaine à l'avance (les étudiants ne travaillent pas toute la semaine). */
export const SHOOT_MIN_DAYS = 7;

export type BriefIssueCode = "missing" | "too_short" | "too_soon" | "past" | "bad_option" | "bad_phone" | "not_attested" | "budget_below_floor";
export type BriefIssue = { key: string; code: BriefIssueCode };
export type BriefWarning = { code: "ambition_vs_budget"; format: string };
export type BriefVerdict = { ok: boolean; issues: BriefIssue[]; warnings: BriefWarning[] };

/** Première date de tournage possible depuis le jour belge `today`. */
export function earliestShootDate(today: string): string {
  return addDays(today, SHOOT_MIN_DAYS);
}

const isBlank = (v: BriefAnswer): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

export function phoneLooksValid(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * Le brief peut-il être verrouillé et envoyé ?
 * Chaque refus a un code nommé (la trace : « briefs refusés par champ manquant »).
 */
export function validateBrief(answers: BriefAnswers, template: BriefTemplate, today: string): BriefVerdict {
  const issues: BriefIssue[] = [];
  const warnings: BriefWarning[] = [];

  for (const q of template.questions) {
    const v = answers[q.key];

    if (q.kind === "flag") {
      if (q.required && v !== true) issues.push({ key: q.key, code: q.key === "deciders_attested" ? "not_attested" : "missing" });
      continue;
    }

    if (isBlank(v)) {
      if (q.required) issues.push({ key: q.key, code: "missing" });
      continue;
    }

    if (q.kind === "text" && typeof v === "string" && q.minLength && v.trim().length < q.minLength) {
      issues.push({ key: q.key, code: "too_short" });
    }
    if (q.kind === "choice" && q.options && typeof v === "string" && !q.options.includes(v)) {
      issues.push({ key: q.key, code: "bad_option" });
    }
    if (q.kind === "multi" && q.options && Array.isArray(v) && v.some((x) => !q.options!.includes(x))) {
      issues.push({ key: q.key, code: "bad_option" });
    }
    if (q.kind === "contact") {
      const c = v as { name?: string; phone?: string };
      if (!c || typeof c !== "object" || !c.name?.trim()) issues.push({ key: q.key, code: "missing" });
      else if (!c.phone || !phoneLooksValid(c.phone)) issues.push({ key: q.key, code: "bad_phone" });
    }
    if (q.kind === "date" && typeof v === "string") {
      if (v < today) issues.push({ key: q.key, code: "past" });
      else if (q.key === "shoot_date" && v < earliestShootDate(today)) issues.push({ key: q.key, code: "too_soon" });
    }
  }

  const budget = answers.budget_cents;
  if (typeof budget === "number" && template.budgetFloorCents !== undefined && budget < template.budgetFloorCents) {
    issues.push({ key: "budget_cents", code: "budget_below_floor" });
  }
  const format = answers.format;
  if (typeof format === "string" && typeof budget === "number") {
    const needed = template.ambitionBudgetCents?.[format];
    if (needed !== undefined && budget < needed) warnings.push({ code: "ambition_vs_budget", format });
  }

  return { ok: issues.length === 0, issues, warnings };
}

// ── Créneaux conseillés ──────────────────────────────────────

export type SlotAdvice = "recommended" | "ok" | "discouraged";
export type ShootSlot = { start: string; end: string; tag: string; advice: SlotAdvice; darkWarning: boolean };

/** Samedi et dimanche : le rush du soir est le pire moment (« on tourne quand le restaurant est vide »). */
function isWeekend(dateISO: string): boolean {
  const d = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/** D'octobre à février, la lumière du jour a disparu avant 17 h : une scène de jour ne se tourne pas le soir. */
function isDarkSeason(dateISO: string): boolean {
  const m = Number(dateISO.slice(5, 7));
  return m >= 10 || m <= 2;
}

export function shootSlots(dateISO: string): ShootSlot[] {
  const base: Omit<ShootSlot, "darkWarning">[] = isWeekend(dateISO)
    ? [
        { start: "09:30", end: "11:30", tag: "Avant l'ouverture", advice: "recommended" },
        { start: "15:00", end: "17:00", tag: "Entre deux services", advice: "ok" },
        { start: "19:00", end: "21:00", tag: "Rush du week-end", advice: "discouraged" },
      ]
    : [
        { start: "09:30", end: "11:30", tag: "Avant le lunch", advice: "recommended" },
        { start: "14:30", end: "17:00", tag: "Entre lunch et dîner", advice: "recommended" },
        { start: "18:30", end: "20:30", tag: "Service du soir", advice: "discouraged" },
      ];
  const dark = isDarkSeason(dateISO);
  return base.map((s) => ({ ...s, darkWarning: dark && s.start >= "17:00" }));
}

// ── Rappels ──────────────────────────────────────────────────

export type ReminderKey = "j7" | "j2" | "veille";

/** Dates (jour belge) des rappels par mail : équipe prévenue, présence confirmée, récap. */
export function reminderDates(shootDate: string): { key: ReminderKey; date: string }[] {
  return [
    { key: "j7", date: addDays(shootDate, -7) },
    { key: "j2", date: addDays(shootDate, -2) },
    { key: "veille", date: addDays(shootDate, -1) },
  ];
}

// ── Remarques de retour ──────────────────────────────────────

export const VIDEO_NOTE_CATEGORIES = ["Cadrage", "Lumière", "Rythme", "Texte", "Son", "Couleurs", "Musique", "Autre"] as const;
export const DESIGN_NOTE_CATEGORIES = ["Texte", "Prix", "Couleur", "Logo", "Photo", "Mise en page", "Autre"] as const;

const VAGUE = /^(je n'?aime pas|j'?aime pas|pas bien|bof|nul|à refaire|a refaire)[ .!]*$/i;
export const NOTE_MIN_LENGTH = 12;

export type NoteIssue = "no_category" | "empty" | "vague" | "too_short";

/** Une remarque de retour dit QUOI changer et POURQUOI — jamais « je n'aime pas » seul. */
export function checkRetouchNote(note: { category: string | null; text: string }, categories: readonly string[]): NoteIssue | null {
  const text = note.text.trim();
  if (!note.category || !categories.includes(note.category)) return "no_category";
  if (!text) return "empty";
  if (VAGUE.test(text)) return "vague";
  if (text.length < NOTE_MIN_LENGTH) return "too_short";
  return null;
}

/** Un tour de retours : au moins une remarque, toutes valables, envoyées EN UNE FOIS. */
export function checkRetouchRound(notes: { category: string | null; text: string }[], categories: readonly string[]): { ok: boolean; problems: { index: number; issue: NoteIssue }[]; empty: boolean } {
  const problems: { index: number; issue: NoteIssue }[] = [];
  notes.forEach((n, index) => {
    const issue = checkRetouchNote(n, categories);
    if (issue) problems.push({ index, issue });
  });
  const empty = notes.length === 0;
  return { ok: !empty && problems.length === 0, problems, empty };
}
