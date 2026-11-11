// Nettoyage des noms lus sur une carte (ADR 0099). Les cartes d'origine sont sales : point final, majuscules
// partout, « SANS » collé au nom. Ces fonctions proposent une forme propre ; le restaurateur garde le dernier mot
// sur le tableau à vérifier. Pures et testées.

/** Retire les espaces en trop, le point final et l'espace avant un point (« SANS OIGNONS . »). */
export function cleanOptionName(raw: string): string {
  let s = (raw ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/\s+([.,;:])/g, "$1");
  s = s.replace(/[.\s]+$/, "");
  // Tout en majuscules (« SOJA SUCREE ») : on garde la première lettre, le reste en minuscules.
  if (s.length > 3 && s === s.toUpperCase() && /[A-ZÀ-Ý]/.test(s)) s = s.charAt(0) + s.slice(1).toLowerCase();
  return s;
}

const SANS_PREFIX = /^\s*(sans|without|no|pas de|geen)\s+(.+)$/i;

/** « SANS AVOCAT » → « Avocat » : le préfixe est porté par le type de groupe « retrait », pas par le nom. */
export function stripSansPrefix(raw: string): { name: string; wasSans: boolean } {
  const m = SANS_PREFIX.exec(raw ?? "");
  if (!m) return { name: cleanOptionName(raw), wasSans: false };
  const name = cleanOptionName(m[2]);
  return { name: name.charAt(0).toUpperCase() + name.slice(1), wasSans: true };
}

/**
 * La clé qui reconnaît une même option écrite de deux façons (« Samouraï » et « samourai. ») : sans accent, sans
 * casse, sans ponctuation. Unique par établissement dans la bibliothèque d'options.
 */
export function optionKey(name: string): string {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un « maximum 99 » vient des plateformes pour dire « sans limite » : on le traduit, on ne l'affiche jamais. */
export function normalizeMax(max: number | null | undefined): number | null {
  if (max === null || max === undefined) return null;
  if (!Number.isFinite(max) || max <= 0) return null;
  return max >= 99 ? null : Math.floor(max);
}
