// ADR 0071 — les notes du score rapide. Fonctions pures, testées.
//
// La fiche garde la grille de l'audit complet (scoreFiche, ADR 0069 §3 A) ;
// les autres volets sont des versions courtes, calculées sur ce qui se lit
// en moins d'une minute. Une note qu'on n'a pas pu calculer vaut null et
// sort de la moyenne (jamais pénalisée).

export type QuickVolet = "fiche" | "avis" | "concurrents" | "site";

export const QUICK_WEIGHTS: Record<QuickVolet, number> = { fiche: 30, avis: 30, concurrents: 20, site: 20 };

/**
 * Avis : la note moyenne (3,0★ → 0, 5,0★ → 100) pèse 70 %, la part des avis
 * récents lus à 4★ ou plus pèse 30 %. Sans note, pas de score.
 */
export function quickReviewScore(rating: number | null, recentRatings: (number | null)[]): number | null {
  if (rating == null) return null;
  const base = Math.max(0, Math.min(1, (rating - 3) / 2));
  const read = recentRatings.filter((r): r is number => r != null);
  if (!read.length) return Math.round(base * 100);
  const goodShare = read.filter((r) => r >= 4).length / read.length;
  return Math.round((base * 0.7 + goodShare * 0.3) * 100);
}

/** Médiane (null si la liste est vide). */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Rated {
  rating: number | null;
  reviewsCount: number | null;
}

/**
 * Concurrents : la place de la note parmi les voisins (60 %) et le volume
 * d'avis face à la médiane des voisins (40 %). Sans voisin noté, pas de score.
 */
export function quickCompetitorScore(self: Rated, neighbors: Rated[]): number | null {
  const rated = neighbors.filter((n) => n.rating != null);
  if (!rated.length || self.rating == null) return null;
  const below = rated.filter((n) => n.rating! < self.rating!).length;
  const ties = rated.filter((n) => n.rating === self.rating).length;
  const rank = (below + ties / 2) / rated.length;
  const med = median(neighbors.map((n) => n.reviewsCount).filter((x): x is number => x != null));
  const volume = med == null || med === 0 ? 1 : Math.min(1, (self.reviewsCount ?? 0) / med);
  return Math.round((rank * 0.6 + volume * 0.4) * 100);
}

/** Rang (1 = meilleure note, puis plus d'avis) de l'établissement parmi ses voisins. */
export function rankAmong(self: Rated & { name: string }, neighbors: (Rated & { name: string })[]): { rank: number; of: number; ahead: string[] } {
  const all = [{ ...self, me: true }, ...neighbors.map((n) => ({ ...n, me: false }))].filter((x) => x.rating != null || x.me);
  all.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewsCount ?? 0) - (a.reviewsCount ?? 0));
  const i = all.findIndex((x) => x.me);
  return { rank: i + 1, of: all.length, ahead: all.slice(0, i).map((x) => x.name) };
}

/** Moyenne pondérée des volets disponibles. */
export function quickGlobal(scores: Partial<Record<QuickVolet, number | null>>): number | null {
  let got = 0;
  let max = 0;
  for (const k of Object.keys(QUICK_WEIGHTS) as QuickVolet[]) {
    const v = scores[k];
    if (v == null) continue;
    got += v * QUICK_WEIGHTS[k];
    max += QUICK_WEIGHTS[k];
  }
  return max ? Math.round(got / max) : null;
}

export type Verdict = "bon" | "a_renforcer" | "fragile";

export function verdictOf(score: number | null): Verdict | null {
  if (score == null) return null;
  return score >= 75 ? "bon" : score >= 50 ? "a_renforcer" : "fragile";
}

export const VERDICT_LABEL: Record<Verdict, string> = { bon: "Solide", a_renforcer: "À renforcer", fragile: "Fragile" };

/** Tranche de note pour la mesure d'audience (jamais la note exacte ni l'établissement). */
export function scoreBand(score: number | null): "lt_50" | "50_74" | "75_plus" | "inconnu" {
  if (score == null) return "inconnu";
  return score >= 75 ? "75_plus" : score >= 50 ? "50_74" : "lt_50";
}

/** Décalage en mètres (est, nord) d'un point par rapport à un centre. */
export function offsetM(center: { lat: number; lng: number }, p: { lat: number; lng: number }): { dx: number; dy: number } {
  const dy = (p.lat - center.lat) * 111_320;
  const dx = (p.lng - center.lng) * 111_320 * Math.cos((center.lat * Math.PI) / 180);
  return { dx: Math.round(dx), dy: Math.round(dy) };
}

/**
 * Numéro de mobile → format international (E.164). Un numéro sans indicatif
 * est lu comme belge (04xx…, 4xx…). Renvoie null si ce n'est pas un numéro
 * plausible.
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s().\-/]/g, "");
  if (!s) return null;
  let digits: string;
  if (s.startsWith("+")) digits = s.slice(1);
  else if (s.startsWith("00")) digits = s.slice(2);
  else if (s.startsWith("0")) digits = `32${s.slice(1)}`;
  else if (/^4\d{8}$/.test(s)) digits = `32${s}`;
  else digits = s;
  if (!/^\d{8,15}$/.test(digits)) return null;
  // Belgique : un mobile a 9 chiffres après 32 et commence par 4.
  if (digits.startsWith("32") && !/^324\d{8}$/.test(digits)) return null;
  return `+${digits}`;
}
