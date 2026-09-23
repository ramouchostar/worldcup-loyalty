// ============================================================
// Les tailles d'un plat, et comment on les écrit (ADR 0067).
//
// Terrain 2026-09-23 : le système proposait d'ajouter « Nuggets (4PC.) » au
// catalogue alors que « Nugget (4) » y est déjà — la caisse écrit la taille à
// sa façon (4PC., 3 pc, x4), au pluriel, parfois collée. Résultat : des
// suggestions inutiles au restaurateur, et des lignes de ticket non
// rattachées à ses statistiques.
//
// Deux idées, et une seule règle :
//   1. Un plat a un NOM et, parfois, une TAILLE (nombre de pièces). On les
//      sépare avant de comparer : « Nuggets (4PC.) » = « Nugget (4) ».
//   2. Côté client, la taille se lit devant : « 6 Churros », pas
//      « Churros (6) » (choix du porteur). C'est un affichage, jamais un
//      renommage en base : l'historique des cadeaux garde ses libellés.
//
// Pur, sans dépendance serveur.
// ============================================================

export type SizedName = {
  /** Le plat sans sa taille, tel qu'écrit (« Nugget », « Churros »). */
  base: string;
  /** Nombre de pièces, ou null si le nom n'en porte pas. */
  size: number | null;
};

// « (4) », « (4PC.) », « (4 pc) », « (4 pcs) », « (4 stuks) », « (4 pièces) »
const SIZE_IN_PARENS = /\s*\(\s*(\d{1,3})\s*(?:pc|pcs|pce|pces|pieces?|pièces?|st|stuks?|x)?\s*\.?\s*\)\s*$/i;
// « 3pc Mozzarella Sticks », « 4 PC Nuggets », « x4 Wings »
const SIZE_PREFIX = /^\s*x?\s*(\d{1,3})\s*(?:pc|pcs|pce|pces|pieces?|pièces?|st|stuks?)?\s*\.?\s+/i;
// « Nuggets x4 », « Wings X 8 »
const SIZE_SUFFIX = /\s+x\s*(\d{1,3})\s*$/i;

/** Sépare le plat de sa taille, quelle que soit la façon dont la caisse l'écrit. */
export function parseSizedName(name: string): SizedName {
  const raw = String(name ?? "").trim();
  for (const pattern of [SIZE_IN_PARENS, SIZE_SUFFIX]) {
    const m = pattern.exec(raw);
    if (m) return { base: raw.replace(pattern, "").trim(), size: Number(m[1]) };
  }
  const prefix = SIZE_PREFIX.exec(raw);
  // « 1664 Blanche » ou « 7up » : un nombre collé au nom n'est pas une taille.
  if (prefix && raw.replace(SIZE_PREFIX, "").trim().length >= 3) {
    return { base: raw.replace(SIZE_PREFIX, "").trim(), size: Number(prefix[1]) };
  }
  return { base: raw, size: null };
}

/**
 * L'article principal d'une ligne de ticket : ce qui précède le premier
 * « + » (les options suivent et ne portent pas le prix), sans le suffixe de
 * catégorie de la caisse — « (Tacos) », « [Tacos] » — mais en gardant les
 * parenthèses qui contiennent un chiffre : ce sont les tailles.
 */
export function mainTicketLabel(raw: string): string {
  let s = String(raw ?? "").split(/\s\+\s/)[0].trim();
  for (;;) {
    const m = /^(.*?)\s*[([{]([^()[\]{}]*)[)\]}]\s*$/.exec(s);
    if (!m || m[1].trim() === "" || /\d/.test(m[2])) break;
    s = m[1].trim();
  }
  return s;
}

/** Clé de comparaison du PLAT seul : casse, accents, pluriel et espaces ignorés. */
export function baseKey(name: string): string {
  return parseSizedName(name)
    .base.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/s$/, "");
}

/** Clé complète plat + taille — « Nuggets (4PC.) » et « Nugget (4) » ont la même. */
export function sizedKey(name: string): string {
  const { size } = parseSizedName(name);
    return size == null ? baseKey(name) : `${baseKey(name)}#${size}`;
}

/**
 * Le nom tel qu'on le montre au client : la taille passe devant
 * (« 6 Churros »), le pluriel suit le nombre. Sans taille, le nom ne bouge pas.
 * Jamais utilisé pour écrire en base — seulement pour afficher.
 */
export function displayItemName(name: string): string {
  const { base, size } = parseSizedName(name);
  if (size == null || base === "") return String(name ?? "").trim();
  const plural = size > 1 && !/s$/i.test(base) ? `${base}s` : base;
  return `${size} ${plural}`;
}
