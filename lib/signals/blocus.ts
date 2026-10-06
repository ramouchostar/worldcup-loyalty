// ============================================================
// Signal « blocus et examens » (backlog plateforme, décidé le 2026-10-01 ;
// ADR 0074 §8 — copilote marketing).
//
// Module PUR : aucun accès base, aucune horloge (la date est injectée). Il lit
// les lignes `reference_calendar` de kind `exam_session` (migration
// 20261006-0200) et dit, pour UN établissement, quelles périodes de blocus ou
// d'examens le concernent aujourd'hui ou bientôt. Il ne choisit PAS l'action
// (« offre tard le soir ») : c'est le rôle du moteur du copilote.
//
// Un établissement est concerné par une université de deux façons :
//   1. `equipe`  — un nom d'équipe ou de communauté déclarée (ADR 0031) de type
//                  école cite l'université (« ULB », « VUB »…). Preuve la plus
//                  forte : ce sont les clients qui s'y reconnaissent. Vaut
//                  quelle que soit la ville.
//   2. `secteur` — son secteur (texte libre, `restaurants.sector`) est dans la
//                  ville ou la commune d'un campus de cette université.
// Les deux se cumulent ; `matchedBy` dit lesquelles ont joué.
//
// Rien ici n'atteint un membre (ADR 0007) : surface plateforme / restaurateur.
// ============================================================

export type ExamPhase = "blocus" | "examens";

export type ExamSessionRow = {
  institution: string;
  city: string;
  phase: ExamPhase;
  starts_on: string; // AAAA-MM-JJ
  ends_on: string;
  label: string;
};

export type BlocusMatch = "equipe" | "secteur";

export type BlocusSignal = {
  institution: string;
  city: string;
  phase: ExamPhase;
  label: string;
  startsOn: string;
  endsOn: string;
  /** « en_cours » : la période couvre `today` ; « a_venir » : elle commence dans l'horizon. */
  status: "en_cours" | "a_venir";
  /** Jours avant le début (0 si en cours). */
  daysUntilStart: number;
  /** Jours restants, aujourd'hui compris (en cours uniquement). */
  daysLeft: number | null;
  matchedBy: BlocusMatch[];
};

export type BlocusInput = {
  today: string; // AAAA-MM-JJ (injecté)
  /** `restaurants.sector` — texte libre, peut être vide. */
  sector: string | null;
  /**
   * Noms d'équipes de type école de l'établissement, et suggestions de
   * communauté de type école déclarées par le restaurateur (ADR 0031).
   */
  schoolCommunityNames: string[];
  rows: ExamSessionRow[];
  /** Jours d'anticipation pour les périodes à venir (défaut 14). */
  horizonDays?: number;
};

export const DEFAULT_HORIZON_DAYS = 14;

// ── Rapprochement ───────────────────────────────────────────────────────────

// Noms sous lesquels une équipe ou une communauté cite une université. Chaque
// entrée est cherchée comme MOT entier (« ucl » ne doit pas attraper « uclouvain »
// par accident ni « bulle »).
const INSTITUTION_ALIASES: Record<string, string[]> = {
  ULB: ["ulb", "universite libre de bruxelles", "solbosch"],
  VUB: ["vub", "vrije universiteit brussel"],
  UCLouvain: ["uclouvain", "ucl", "universite catholique de louvain", "louvain la neuve", "lln"],
  "KU Leuven": ["ku leuven", "kuleuven", "katholieke universiteit leuven"],
  // Hautes écoles. « vinci » seul est volontairement absent : un lycée Léonard
  // de Vinci n'est pas la haute école. « Parnasse-ISEI » et l'ECAM en font partie.
  "Haute École Léonard de Vinci": [
    "haute ecole leonard de vinci", "he vinci", "he leonard de vinci", "ecam", "parnasse isei",
  ],
  EPHEC: ["ephec"],
  HE2B: ["he2b", "haute ecole bruxelles brabant"],
  // « erasmus » seul est absent : c'est aussi le programme d'échange.
  EHB: ["ehb", "erasmushogeschool", "erasmushogeschool brussel", "erasmus hogeschool"],
};

// Communes et noms de lieu qui valent « la ville du campus ». À Bruxelles, un
// campus est dans une commune (Ixelles, Etterbeek, Jette, Woluwe…) : un
// restaurant à Ixelles est « proche du campus de Bruxelles ».
const CITY_ALIASES: Record<string, string[]> = {
  Bruxelles: [
    "bruxelles", "brussels", "brussel", "ixelles", "elsene", "etterbeek", "jette",
    "woluwe", "saint gilles", "sint gillis", "anderlecht", "schaerbeek", "saint josse", "forest",
    "uccle",
  ],
  "Louvain-la-Neuve": ["louvain la neuve", "lln", "ottignies"],
  Leuven: ["leuven", "louvain", "heverlee", "kessel lo"],
};

/** Minuscules, sans accents, ponctuation → espaces : « Saint-Gilles » = « saint gilles ». */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function mentionsInstitution(names: string[], institution: string): boolean {
  const aliases = INSTITUTION_ALIASES[institution] ?? [normalizeText(institution)];
  return names.some((n) => {
    const t = normalizeText(n);
    return aliases.some((a) => containsWord(t, a));
  });
}

function sectorInCity(sector: string | null, city: string): boolean {
  let s = normalizeText(sector ?? "");
  // « Louvain » seul désigne Leuven en français, mais « Louvain-la-Neuve » est
  // une autre ville : sans ce retrait, un secteur de LLN compterait pour Leuven.
  if (city === "Leuven") s = s.replace("louvain la neuve", " ");
  if (!s) return false;
  const aliases = CITY_ALIASES[city] ?? [normalizeText(city)];
  return aliases.some((a) => containsWord(s, a));
}

// ── Dates (jours calendaires, UTC : pas de dérive d'heure d'été) ────────────

const DAY_MS = 86_400_000;
function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

// ── Lecture ─────────────────────────────────────────────────────────────────

/**
 * Périodes de blocus / d'examens qui concernent l'établissement, en cours ou
 * commençant dans l'horizon. Triées : en cours d'abord, puis par début, le
 * blocus avant les examens à début égal. Un même (université, phase, période)
 * n'apparaît qu'une fois, même si plusieurs campus de l'université
 * correspondent ; `matchedBy` cumule alors les raisons.
 */
export function readBlocusSignals(input: BlocusInput): BlocusSignal[] {
  const horizon = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const today = dayNumber(input.today);
  const byKey = new Map<string, BlocusSignal>();

  for (const row of input.rows) {
    const start = dayNumber(row.starts_on);
    const end = dayNumber(row.ends_on);
    const inProgress = start <= today && today <= end;
    const upcoming = start > today && start - today <= horizon;
    if (!inProgress && !upcoming) continue;

    const matchedBy: BlocusMatch[] = [];
    if (mentionsInstitution(input.schoolCommunityNames, row.institution)) matchedBy.push("equipe");
    if (sectorInCity(input.sector, row.city)) matchedBy.push("secteur");
    if (matchedBy.length === 0) continue;

    const key = `${row.institution}|${row.phase}|${row.starts_on}|${row.ends_on}`;
    const seen = byKey.get(key);
    if (seen) {
      for (const m of matchedBy) if (!seen.matchedBy.includes(m)) seen.matchedBy.push(m);
      continue;
    }
    byKey.set(key, {
      institution: row.institution,
      city: row.city,
      phase: row.phase,
      label: row.label,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      status: inProgress ? "en_cours" : "a_venir",
      daysUntilStart: inProgress ? 0 : start - today,
      daysLeft: inProgress ? end - today + 1 : null,
      matchedBy,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      Number(b.status === "en_cours") - Number(a.status === "en_cours") ||
      a.startsOn.localeCompare(b.startsOn) ||
      Number(a.phase === "examens") - Number(b.phase === "examens") ||
      a.institution.localeCompare(b.institution)
  );
}

/** Vrai si au moins une période de BLOCUS est en cours : c'est elle qui porte l'offre tardive. */
export function isBlocusActive(signals: BlocusSignal[]): boolean {
  return signals.some((s) => s.phase === "blocus" && s.status === "en_cours");
}
