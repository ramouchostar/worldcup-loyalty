// ADR 0100 §8 — l'import du PDF du menu : ce que le restaurateur a écrit lui-même (descriptions, allergènes), rapproché de
// son catalogue. Logique PURE : la lecture du PDF par Claude vit dans `pdf-read.ts`, l'écriture dans `pdf-save.ts`.
//
// Règles qui ne bougent pas (ADR 0099 §3, ADR 0100 §8) :
//  - un allergène n'est JAMAIS déduit d'un nom de plat : il vient du PDF, écrit noir sur blanc, ou du restaurateur ;
//  - ce qui vient du PDF est une PROPOSITION à relire : tant que le restaurateur n'a pas confirmé un plat, ses allergènes
//    ne sont pas des faits (« demande-nous au comptoir »), jamais « aucun » ;
//  - une ligne du PDF qui ne désigne pas un plat de façon certaine n'est rapprochée de rien (jamais le plus ressemblant
//    « au hasard ») : le restaurateur la voit à part.

import { MAX_DESCRIPTION } from "./descriptions";

export const ALLERGENS = [
  ["gluten", "Gluten"], ["crustaces", "Crustacés"], ["oeufs", "Œufs"], ["poisson", "Poisson"], ["arachides", "Arachides"],
  ["soja", "Soja"], ["lait", "Lait"], ["coque", "Fruits à coque"], ["celeri", "Céleri"], ["moutarde", "Moutarde"],
  ["sesame", "Sésame"], ["sulfites", "Sulfites"], ["lupin", "Lupin"], ["mollusques", "Mollusques"],
] as const;

export type AllergenKey = (typeof ALLERGENS)[number][0];
export const ALLERGEN_KEYS: readonly AllergenKey[] = ALLERGENS.map(([k]) => k);
export const ALLERGEN_LABEL: Record<AllergenKey, string> = Object.fromEntries(ALLERGENS) as Record<AllergenKey, string>;

export const isAllergenKey = (v: unknown): v is AllergenKey => typeof v === "string" && (ALLERGEN_KEYS as readonly string[]).includes(v);

/** Ce que la lecture du PDF rend pour une ligne de carte. `allergens: null` = le PDF n'imprime rien pour ce plat. */
export type PdfLine = { name: string; description: string | null; allergens: AllergenKey[] | null };

export type CatalogItem = { id: string; name: string };

export type MatchHow = "exact" | "proche";
export type Match = { articleId: string; line: PdfLine; how: MatchHow };

export type MatchResult = {
  matches: Match[];
  /** Lignes du PDF qui ne désignent aucun plat de façon certaine. */
  unmatchedLines: PdfLine[];
  /** Plats du catalogue sans ligne dans le PDF. */
  articlesWithout: string[];
};

const STOP = new Set(["le", "la", "les", "un", "une", "des", "de", "du", "d", "au", "aux", "et", "a", "en", "the"]);

/** Un nom comparable : minuscules, sans accents (« œ » → « oe »), sans ponctuation, sans mots vides. */
export function normalizeName(s: string): string {
  return tokens(s).join(" ");
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

/** Part commune de deux noms : mots en commun / mots de l'union. 1 = mêmes mots, quel que soit l'ordre. */
function similarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return common / (A.size + B.size - common);
}

/** En dessous, on ne rapproche pas : « Pizza reine » ne devient pas « Pizza royale ». */
export const NEAR_THRESHOLD = 0.75;

/**
 * Rapproche les lignes du PDF des plats du catalogue. Un rapprochement n'est gardé que s'il est SANS AMBIGUÏTÉ :
 * un seul plat candidat pour la ligne, et une seule ligne pour ce plat. Sinon la ligne reste « à part ».
 */
export function matchLines(lines: PdfLine[], items: CatalogItem[]): MatchResult {
  const setKey = (t: string[]) => [...new Set(t)].sort().join(" "); // mêmes mots, quel que soit l'ordre
  const itemTokens = items.map((i) => ({ id: i.id, key: setKey(tokens(i.name)), t: tokens(i.name) }));
  const claims = new Map<string, number[]>(); // plat -> lignes qui le désignent
  const chosen = new Map<number, { id: string; how: MatchHow }>(); // ligne -> plat

  lines.forEach((line, li) => {
    const lt = tokens(line.name);
    const key = setKey(lt);
    if (key === "") return;
    const exact = itemTokens.filter((i) => i.key === key);
    let pick: { id: string; how: MatchHow } | null = null;
    if (exact.length === 1) pick = { id: exact[0].id, how: "exact" };
    else if (exact.length === 0) {
      let best = 0;
      let bestIds: string[] = [];
      for (const i of itemTokens) {
        const s = similarity(lt, i.t);
        if (s > best) { best = s; bestIds = [i.id]; } else if (s === best && s > 0) bestIds.push(i.id);
      }
      if (best >= NEAR_THRESHOLD && bestIds.length === 1) pick = { id: bestIds[0], how: "proche" };
    }
    if (!pick) return;
    chosen.set(li, pick);
    claims.set(pick.id, [...(claims.get(pick.id) ?? []), li]);
  });

  const matches: Match[] = [];
  const unmatchedLines: PdfLine[] = [];
  lines.forEach((line, li) => {
    const pick = chosen.get(li);
    if (pick && (claims.get(pick.id) ?? []).length === 1) matches.push({ articleId: pick.id, line, how: pick.how });
    else unmatchedLines.push(line);
  });
  const matched = new Set(matches.map((m) => m.articleId));
  return { matches, unmatchedLines, articlesWithout: items.filter((i) => !matched.has(i.id)).map((i) => i.id) };
}

/** Une description venue du PDF, nettoyée ; `null` si elle ne peut pas être proposée (vide, ou trop longue). */
export function cleanPdfDescription(raw: string | null | undefined): { text: string | null; tooLong: boolean } {
  const text = (raw ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  if (text === "") return { text: null, tooLong: false };
  if (text.length > MAX_DESCRIPTION) return { text: null, tooLong: true };
  return { text, tooLong: false };
}

/** Ce que le restaurateur relit pour UN plat. */
export type PdfReview = {
  articleId: string;
  how: MatchHow;
  /** Texte proposé (celui du PDF, nettoyé) ; modifiable. `null` = pas de description dans le PDF. */
  description: string | null;
  descriptionOriginal: string | null;
  descriptionTooLong: boolean;
  /** Si on garde cette description (case cochée). */
  useDescription: boolean;
  allergens: AllergenKey[];
  /** Le PDF imprimait des allergènes pour ce plat (sinon la liste vient du restaurateur seul). */
  allergensFromPdf: boolean;
  allergensOriginal: AllergenKey[];
  /** « J'ai relu les allergènes de ce plat » : seul ce geste en fait des faits. */
  confirmed: boolean;
};

export function buildReviews(matches: Match[]): PdfReview[] {
  return matches.map((m) => {
    const d = cleanPdfDescription(m.line.description);
    const alg = [...new Set((m.line.allergens ?? []).filter(isAllergenKey))];
    return {
      articleId: m.articleId, how: m.how,
      description: d.text, descriptionOriginal: d.text, descriptionTooLong: d.tooLong,
      useDescription: d.text !== null,
      allergens: alg, allergensFromPdf: alg.length > 0, allergensOriginal: alg,
      // Un rapprochement approximatif ne se confirme pas tout seul : le restaurateur doit le regarder.
      confirmed: false,
    };
  });
}

export const setUseDescription = (r: PdfReview, use: boolean): PdfReview => ({ ...r, useDescription: use && r.description !== null });
export const setDescription = (r: PdfReview, text: string): PdfReview => {
  const t = text.replace(/[<>]/g, "").slice(0, MAX_DESCRIPTION);
  return { ...r, description: t.trim() === "" ? null : t, useDescription: t.trim() !== "" };
};
export const toggleAllergen = (r: PdfReview, k: AllergenKey): PdfReview => ({
  ...r,
  allergens: r.allergens.includes(k) ? r.allergens.filter((a) => a !== k) : [...r.allergens, k],
  // Changer la liste défait la confirmation : ce qui est confirmé est ce que le restaurateur voit à l'écran.
  confirmed: false,
});
export const setConfirmed = (r: PdfReview, v: boolean): PdfReview => ({ ...r, confirmed: v });

/** Ce qui part en base pour un plat. `allergens: null` = pas confirmé : le site dit « demande-nous au comptoir ». */
export type PdfSaveRow = {
  articleId: string;
  description: string | null;
  descriptionSource: "pdf" | "restaurateur" | null;
  allergens: AllergenKey[] | null;
};

export function toSaveRow(r: PdfReview): PdfSaveRow {
  const useDesc = r.useDescription && r.description !== null;
  return {
    articleId: r.articleId,
    description: useDesc ? r.description : null,
    descriptionSource: useDesc ? (r.description === r.descriptionOriginal ? "pdf" : "restaurateur") : null,
    // Confirmé sans aucun allergène = « le restaurateur dit qu'il n'y en a pas » : le seul cas où « aucun » est écrit.
    allergens: r.confirmed ? [...r.allergens] : null,
  };
}

/** Un plat sans rien à écrire n'est pas envoyé. */
export const hasEffect = (row: PdfSaveRow): boolean => row.description !== null || row.allergens !== null;

export type PdfTrace = {
  linesRead: number;
  matched: number;
  matchedNear: number;
  unmatched: number;
  articlesWithout: number;
  descProposed: number;
  descKept: number;
  descEdited: number;
  allergensProposed: number;
  allergensChanged: number;
  allergensConfirmed: number;
};

export type MatchCounts = { matched: number; matchedNear: number; unmatched: number; articlesWithout: number };

export const countsOf = (r: MatchResult): MatchCounts => ({
  matched: r.matches.length,
  matchedNear: r.matches.filter((m) => m.how === "proche").length,
  unmatched: r.unmatchedLines.length,
  articlesWithout: r.articlesWithout.length,
});

export function traceOfReviews(linesRead: number, counts: MatchCounts, reviews: PdfReview[]): PdfTrace {
  const sameSet = (a: AllergenKey[], b: AllergenKey[]) => a.length === b.length && a.every((k) => b.includes(k));
  const withPdfAllergens = reviews.filter((r) => r.allergensFromPdf);
  return {
    linesRead,
    ...counts,
    descProposed: reviews.filter((r) => r.descriptionOriginal !== null).length,
    descKept: reviews.filter((r) => r.useDescription && r.description !== null && r.description === r.descriptionOriginal).length,
    descEdited: reviews.filter((r) => r.useDescription && r.description !== null && r.description !== r.descriptionOriginal).length,
    allergensProposed: withPdfAllergens.length,
    allergensChanged: withPdfAllergens.filter((r) => !sameSet(r.allergens, r.allergensOriginal)).length,
    allergensConfirmed: reviews.filter((r) => r.confirmed).length,
  };
}
