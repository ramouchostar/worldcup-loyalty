// ADR 0100 §11 — ce que le menu DU RESTAURATEUR (son PDF, ou le lien de son menu en ligne) dit de sa propre carte, au-delà
// des descriptions et des allergènes : la catégorie sous laquelle chaque plat est classé, les sauces disponibles, et les
// accompagnements gratuits (« servi avec frites ou riz »). Logique PURE : la lecture vit dans `menu-read.ts`.
//
// Règles qui ne bougent pas :
//  - rien n'est inventé : une sauce ou un accompagnement n'existe ici que s'il est écrit dans le menu ; un menu muet ne
//    propose rien (les listes d'idées de `packs.ts` restent ce qu'elles étaient) ;
//  - tout ce qui vient du menu est une PROPOSITION : un groupe dont nous ne sommes pas sûrs de la sorte reste « à confirmer » ;
//  - les prix ne viennent jamais d'ici (ADR 0099 §5) : un choix gratuit, ou un prix que le restaurateur donne lui-même.

import { optionKey } from "./normalize";
import { foodFamily, FAMILY_LABEL, LOT_OF, type Family } from "./families";
import type { PackGroup } from "./packs";

export const MAX_SECTIONS = 80;
export const MAX_NAMES = 40;
export const MAX_NAME = 60;

/**
 * Ce qu'un menu dit d'une de ses rubriques. `category: null` = la phrase vaut pour tout le menu (« Sauces disponibles : … »
 * imprimé en tête de carte). `oneOf` = les accompagnements entre lesquels le client CHOISIT (« frites ou riz »).
 */
export type MenuSection = { category: string | null; sauces: string[]; oneOf: string[] };

/** Ce qui s'applique à UN plat : ce que dit sa rubrique, à défaut ce que dit le menu entier. */
export type ArticleExtras = { sauces: string[]; oneOf: string[] };

export type MenuHints = {
  /** La catégorie imprimée dans le menu, par plat du catalogue. */
  categoryOf: Record<string, string>;
  /** Sauces et accompagnements, par plat du catalogue (absent = le menu n'en dit rien). */
  extrasOf: Record<string, ArticleExtras>;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Une liste de noms propre : texte seulement, sans balise, 60 lettres au plus, sans doublon, 40 au plus. */
export function cleanNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const name = x.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
    const key = optionKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_NAMES) break;
  }
  return out;
}

export function cleanCategory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return t === "" ? null : t;
}

/** Ce que Claude a rendu, nettoyé : les rubriques sans sauce ni accompagnement ne servent à rien et sont écartées. */
export function cleanSections(raw: unknown): MenuSection[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuSection[] = [];
  for (const s of raw) {
    if (!isObj(s)) continue;
    const sauces = cleanNames(s.sauces);
    const oneOf = cleanNames(s.oneOf);
    if (sauces.length === 0 && oneOf.length === 0) continue;
    out.push({ category: cleanCategory(s.category), sauces, oneOf });
    if (out.length >= MAX_SECTIONS) break;
  }
  return out;
}

/**
 * Rattache à chaque plat rapproché sa catégorie et ses extras. La rubrique d'un plat prime ; à défaut, la phrase qui vaut
 * pour tout le menu. Une catégorie que le menu écrit de deux façons (« Burgers » / « BURGERS ») est une seule.
 */
export function buildHints(matches: { articleId: string; category: string | null }[], sections: MenuSection[]): MenuHints {
  const byCategory = new Map<string, MenuSection>();
  let whole: MenuSection | null = null;
  for (const s of sections) {
    if (s.category === null) whole = whole ? { category: null, sauces: cleanNames([...whole.sauces, ...s.sauces]), oneOf: cleanNames([...whole.oneOf, ...s.oneOf]) } : s;
    else {
      const k = optionKey(s.category);
      const prev = byCategory.get(k);
      byCategory.set(k, prev ? { category: prev.category, sauces: cleanNames([...prev.sauces, ...s.sauces]), oneOf: cleanNames([...prev.oneOf, ...s.oneOf]) } : s);
    }
  }
  const hints: MenuHints = { categoryOf: {}, extrasOf: {} };
  for (const m of matches) {
    const cat = cleanCategory(m.category);
    if (cat) hints.categoryOf[m.articleId] = cat;
    const own = cat ? byCategory.get(optionKey(cat)) : undefined;
    const sauces = own && own.sauces.length > 0 ? own.sauces : whole?.sauces ?? [];
    const oneOf = own && own.oneOf.length > 0 ? own.oneOf : whole?.oneOf ?? [];
    if (sauces.length > 0 || oneOf.length > 0) hints.extrasOf[m.articleId] = { sauces, oneOf };
  }
  return hints;
}

/** Deux plats ont les mêmes extras quand ils offrent les mêmes sauces et les mêmes accompagnements, quel que soit l'ordre. */
export function extrasSignature(e: ArticleExtras | undefined): string {
  if (!e) return "";
  const norm = (xs: string[]) => [...new Set(xs.map(optionKey))].sort().join("|");
  return `${norm(e.sauces)}#${norm(e.oneOf)}`;
}

/** Les chiffres de l'import, pour la trace (ADR 0065) et pour dire au restaurateur ce que nous avons repris. */
export type MenuCounts = { categories: number; sauceLists: number; sideLists: number };

export function countHints(h: MenuHints): MenuCounts {
  const cats = new Set(Object.values(h.categoryOf).map(optionKey));
  const sauces = new Set<string>();
  const sides = new Set<string>();
  for (const e of Object.values(h.extrasOf)) {
    if (e.sauces.length > 0) sauces.add(extrasSignature({ sauces: e.sauces, oneOf: [] }));
    if (e.oneOf.length > 0) sides.add(extrasSignature({ sauces: [], oneOf: e.oneOf }));
  }
  return { categories: cats.size, sauceLists: sauces.size, sideLists: sides.size };
}

// ─── Des groupes d'options à partir des extras ───────────────────────────────

const SAUCE_TITLE = /^sauces?$/i;

/**
 * Les groupes de départ d'un lot, complétés par ce que le menu dit :
 *  - sauces : si le lot a déjà une liste « Sauce(s) » gratuite, ses choix sont REMPLACÉS par ceux du menu (ce sont les
 *    sauces de ce restaurant, pas des idées) ; sinon une liste gratuite « Sauces » est ajoutée, à confirmer (on ne sait
 *    pas si le client en prend une ou plusieurs) ;
 *  - accompagnement : « frites ou riz » devient une liste gratuite où le client en choisit UN, obligatoire. Un seul
 *    accompagnement n'est pas un choix : rien n'est ajouté.
 * Jamais de prix, jamais de choix coché d'office.
 */
export function applyExtras(base: PackGroup[], extras: ArticleExtras | undefined): PackGroup[] {
  if (!extras) return base;
  let groups = base.map((g) => ({ ...g, choices: g.choices.map((c) => ({ ...c })) }));

  if (extras.sauces.length > 0) {
    const at = groups.findIndex((g) => g.kind === "inclus" && SAUCE_TITLE.test(g.title.trim()));
    const choices = extras.sauces.map((name) => ({ name, fromMenu: true }));
    if (at >= 0) groups[at] = { ...groups[at], choices, guess: false };
    else groups = [...groups, { title: "Sauces", kind: "inclus", min: 0, max: 1, guess: true, choices }];
  }

  if (extras.oneOf.length >= 2) {
    const accompaniment: PackGroup = { title: "Accompagnement", kind: "inclus", min: 1, max: 1, choices: extras.oneOf.map((name) => ({ name, fromMenu: true })) };
    const afterSauces = groups.findIndex((g) => g.kind === "inclus" && SAUCE_TITLE.test(g.title.trim()));
    groups = afterSauces >= 0 ? [...groups.slice(0, afterSauces + 1), accompaniment, ...groups.slice(afterSauces + 1)] : [accompaniment, ...groups];
  }
  return groups;
}

// ─── Les formules (« Menu kebab », « Menu burger ») ──────────────────────────

const MENU_WORDS = /\b(menus?|formules?|combos?|box|boxes|meal|duo|trio|pack|xxl|xl|maxi|mini|kids?|enfants?|junior|big|large|small|medium|\d+\s?(?:pcs?|pieces?|p))\b/g;
const GENERIC_CATEGORY = /^(menus?|formules?|combos?|boxes?|box|promos?|offres?|deals?)$/;

/** Les familles dont les formules se rangent ensemble sous le même nom (les durums et les kebabs sont un même plat). */
const MENU_LABEL: Partial<Record<Family, string>> = { durum: "Menus kebabs et durums", pain_turc: "Menus kebabs et durums" };

/**
 * Le groupe d'une formule : « Menu kebab », « Menu durum » → les menus kebabs ; « 12 Wings Menu », « Menu poulet » → les menus
 * poulet. Le nom décide ; à défaut la catégorie du menu (si elle ne dit pas seulement « Menus ») ; à défaut « Autres menus ».
 */
export function menuKind(article: { name: string; category?: string | null }): { key: string; label: string } {
  const ofFamily = (family: Family) => ({ key: `menu:${LOT_OF[family] ?? family}`, label: MENU_LABEL[family] ?? `Menus ${FAMILY_LABEL[family].charAt(0).toLowerCase()}${FAMILY_LABEL[family].slice(1)}` });
  const bare = (text: string) => optionKey(text).replace(MENU_WORDS, " ").replace(/\s+/g, " ").trim();

  const byName = foodFamily(bare(article.name));
  if (byName) return ofFamily(byName);

  const cat = cleanCategory(article.category);
  if (cat) {
    const byCategory = foodFamily(bare(cat));
    if (byCategory) return ofFamily(byCategory);
    if (!GENERIC_CATEGORY.test(optionKey(cat))) return { key: `menu:cat:${optionKey(cat)}`, label: /\bmenus?\b|formule|combo/i.test(cat) ? cat : `Menus « ${cat} »` };
  }
  return { key: "menu:divers", label: "Autres menus" };
}
