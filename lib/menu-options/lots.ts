// L'éditeur des options par GROUPES DE PLATS (ADR 0100) : on part du catalogue, on range les articles en lots qui ont
// les mêmes options, on prépare les choix d'après la famille, et le restaurateur règle un lot d'un seul geste.
// Tout l'état de l'écran est ici, en fonctions pures : le composant ne fait qu'afficher et appeler ces actions, et le
// serveur rejoue la même validation avant d'écrire. Aucun prix n'est jamais prérempli (ADR 0099 §5).

import { DEFAULT_TONE, describeArticle, MAX_DESCRIPTION, type Described, type Tone, type Viande } from "./descriptions";
import { validateTree, type TreeIssue } from "./model";
import { optionKey } from "./normalize";
import { AFFINITY, LOT_OF, SUGGESTED_WITH, classifyArticle, familyStrength, joinLabels, type Family, type Strength } from "./families";
import { packFor, type PackGroup } from "./packs";
import type { GroupKind, OptionChoice, OptionGroup } from "./types";

export type ArticleRef = { id: string; name: string; category: string };

export type DraftChoice = {
  key: string;
  name: string;
  /** `null` = le restaurateur n'a pas encore donné son prix. Jamais deviné. */
  priceDelta: number | null;
  maxQty: number;
  isDefault: boolean;
  /** Décoché : le client ne le verra pas. */
  keep: boolean;
  origin: "pack" | "ajout";
  groups: DraftGroup[];
};

export type DraftGroup = {
  key: string;
  title: string;
  kind: GroupKind;
  min: number;
  max: number | null;
  choices: DraftChoice[];
  /** Nous ne sommes pas sûrs de la sorte du groupe : à confirmer. */
  guess: boolean;
  confirmed: boolean;
};

export type Lot = {
  key: string;
  label: string;
  family: Family;
  strength: Strength;
  articleIds: string[];
  /** Articles que NOUS avons ajoutés au lot parce qu'ils vont souvent avec lui. */
  suggestedIds: string[];
  groups: DraftGroup[];
  validated: boolean;
  /** Combien de choix nous avions proposés, et combien de lignes le restaurateur a changées : la trace (ADR 0065). */
  proposed: number;
  edits: number;
  pricesSet: number;
  /** « De quelle viande sont tes burgers quand le nom ne le dit pas ? » Sert aux descriptions du groupe, facultatif. */
  viande: Viande | null;
};

export type Stats = { suggested: number; suggestedRemoved: number; added: number; merges: number; splits: number };

export type EditorState = {
  articles: Record<string, ArticleRef>;
  /** La famille reconnue de chaque article : les phrases (« Un durum… », « Des pâtes… ») en dépendent. */
  families: Record<string, Family>;
  /** Le ton des descriptions, pour tous les plats : sobre, gourmand ou fun. */
  tone: Tone;
  /** Ce que le restaurateur a écrit lui-même, par article. « » = il a voulu aucune description. */
  descEdits: Record<string, string>;
  lots: Lot[];
  /** Articles que nous n'avons pas su ranger : à ajouter à un lot par le restaurateur. */
  unplaced: string[];
  stats: Stats;
  seq: number;
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// L'ordre d'affichage des familles : les snacks d'abord, le reste ensuite, les articles sans choix en dernier.
const ORDER: Family[] = [
  "mitraillette", "durum", "pain_turc", "kapsalon", "panini", "sandwich", "tacos", "burger", "wrap", "pizza", "pates",
  "sushi", "poke", "wok", "curry", "poulet_frit", "assiette", "snack_friture", "salade", "soupe", "entree", "petit_dej",
  "boulangerie", "accompagnement", "boisson", "dessert", "sauce",
];

// ─── Construction ────────────────────────────────────────────────────────────

function buildGroup(pg: PackGroup, next: (p: string) => string): DraftGroup {
  return {
    key: next("g"),
    title: pg.title,
    kind: pg.kind,
    min: pg.min,
    max: pg.max,
    guess: !!pg.guess,
    confirmed: !pg.guess,
    choices: pg.choices.map((pc) => ({
      key: next("c"),
      name: pc.name,
      // Un supplément ou une variante qui coûte plus que la base : c'est son prix à lui, pas le nôtre.
      priceDelta: pg.kind === "extra" || (pg.kind === "variante" && !pc.isDefault) ? null : 0,
      maxQty: 1,
      isDefault: !!pc.isDefault,
      keep: true,
      origin: "pack",
      groups: pc.sub ? [buildGroup(pc.sub, next)] : [],
    })),
  };
}

const countChoices = (groups: DraftGroup[]): number => groups.reduce((n, g) => n + g.choices.reduce((m, c) => m + 1 + countChoices(c.groups), 0), 0);

/** Range les articles du catalogue en lots. Les articles que nous ne savons pas ranger (formules, promotions, inconnus) restent à part. */
export function buildEditor(articles: ArticleRef[]): EditorState {
  let n = 0;
  const next = (p: string) => `${p}${++n}`;
  const byFamily = new Map<Family, string[]>();
  const unplaced: string[] = [];
  const families: Record<string, Family> = {};
  for (const a of articles) {
    const family = classifyArticle(a);
    families[a.id] = family;
    if (familyStrength(family) === null) unplaced.push(a.id);
    else (byFamily.get(family) ?? byFamily.set(family, []).get(family)!).push(a.id);
  }

  // Un lot par famille, sauf celles qui partagent leurs choix (durum et pain turc ; boissons, desserts, sauces).
  const lotFamilies = new Map<string, Family[]>();
  for (const f of ORDER) if (byFamily.has(f)) (lotFamilies.get(LOT_OF[f] ?? f) ?? lotFamilies.set(LOT_OF[f] ?? f, []).get(LOT_OF[f] ?? f)!).push(f);

  // Les plats « qui vont avec » : proposés dans le lot, jamais imposés.
  const suggested = new Map<string, Family[]>();
  for (const [lotKey, withFamilies] of Object.entries(SUGGESTED_WITH)) {
    if (!lotFamilies.has(lotKey)) continue;
    for (const sf of withFamilies ?? []) {
      if (!lotFamilies.has(sf)) continue;
      lotFamilies.delete(sf);
      suggested.set(lotKey, [...(suggested.get(lotKey) ?? []), sf]);
    }
  }

  const lots: Lot[] = [];
  const stats: Stats = { suggested: 0, suggestedRemoved: 0, added: 0, merges: 0, splits: 0 };
  for (const [lotKey, families] of lotFamilies) {
    const sugg = suggested.get(lotKey) ?? [];
    const articleIds = families.flatMap((f) => byFamily.get(f) ?? []);
    const suggestedIds = sugg.flatMap((f) => byFamily.get(f) ?? []);
    const primary = families[0];
    const groups = packFor(lotKey).map((pg) => buildGroup(pg, next));
    stats.suggested += suggestedIds.length;
    lots.push({
      key: next("lot"),
      label: joinLabels([...families, ...sugg]),
      family: primary,
      strength: lotKey === "sans_choix" ? "aucune" : familyStrength(primary) ?? "faible",
      articleIds: [...articleIds, ...suggestedIds],
      suggestedIds,
      groups,
      validated: false,
      proposed: countChoices(groups),
      edits: 0,
      pricesSet: 0,
      viande: null,
    });
  }
  return { articles: Object.fromEntries(articles.map((a) => [a.id, a])), families, tone: DEFAULT_TONE, descEdits: {}, lots, unplaced, stats, seq: n };
}

// ─── Parcours et recherche ───────────────────────────────────────────────────

function eachGroup(groups: DraftGroup[], fn: (g: DraftGroup, parent: DraftChoice | null) => void, parent: DraftChoice | null = null) {
  for (const g of groups) {
    fn(g, parent);
    for (const c of g.choices) eachGroup(c.groups, fn, c);
  }
}

function eachChoice(groups: DraftGroup[], fn: (c: DraftChoice, g: DraftGroup) => void) {
  eachGroup(groups, (g) => g.choices.forEach((c) => fn(c, g)));
}

const findLot = (s: EditorState, key: string) => s.lots.find((l) => l.key === key);
const lotOfArticle = (s: EditorState, id: string) => s.lots.find((l) => l.articleIds.includes(id));

function findGroup(lot: Lot, key: string): DraftGroup | undefined {
  let found: DraftGroup | undefined;
  eachGroup(lot.groups, (g) => { if (g.key === key) found = g; });
  return found;
}

function findChoice(lot: Lot, key: string): { choice: DraftChoice; group: DraftGroup } | undefined {
  let found: { choice: DraftChoice; group: DraftGroup } | undefined;
  eachChoice(lot.groups, (c, g) => { if (c.key === key) found = { choice: c, group: g }; });
  return found;
}

/** Un choix a besoin de son prix : extra ou variante payante, gardé, pas encore donné. */
export const needsPrice = (g: DraftGroup, c: DraftChoice) => c.keep && c.priceDelta === null && (g.kind === "extra" || g.kind === "variante");

export function pricesMissing(lot: Lot): number {
  let n = 0;
  eachChoice(lot.groups, (c, g) => { if (needsPrice(g, c)) n++; });
  return n;
}

export const groupPricesMissing = (g: DraftGroup) => g.choices.filter((c) => needsPrice(g, c)).length;

/** Lignes à regarder : groupes dont nous ne sommes pas sûrs de la sorte et qu'il n'a pas confirmés. */
export function lotPending(lot: Lot): number {
  let n = 0;
  eachGroup(lot.groups, (g) => { if (g.guess && !g.confirmed) n++; });
  return n;
}

// ─── Conversion vers le modèle des options ───────────────────────────────────

function toOptionGroup(g: DraftGroup): OptionGroup {
  const choices: OptionChoice[] = g.choices
    .filter((c) => c.keep)
    .map((c) => ({
      id: c.key, libraryId: optionKey(c.name), name: c.name.trim(), priceDelta: c.priceDelta ?? 0, maxQty: c.maxQty,
      isDefault: c.isDefault, isAvailable: true, groups: c.groups.map(toOptionGroup),
    }));
  return { id: g.key, title: g.title.trim(), kind: g.kind, min: g.min, max: g.max, choices };
}

export const toOptionTrees = (lot: Lot): OptionGroup[] => lot.groups.map(toOptionGroup);

export type LotIssues = { pricesMissing: number; pending: number; errors: TreeIssue[]; warnings: TreeIssue[] };

/** Ce qui empêche (ou accompagne) la validation d'un lot : prix manquants, structure incohérente, noms vides ou doublons. */
export function lotIssues(lot: Lot): LotIssues {
  const all = validateTree(toOptionTrees(lot));
  const names: TreeIssue[] = [];
  eachGroup(lot.groups, (g) => {
    if (!g.title.trim()) names.push({ groupId: g.key, title: g.title, level: "erreur", code: "titre", message: "Une liste de choix n'a pas de nom." });
    const seen = new Set<string>();
    for (const c of g.choices.filter((x) => x.keep)) {
      const k = optionKey(c.name);
      if (!k) names.push({ groupId: g.key, title: g.title, level: "erreur", code: "nom", message: `« ${g.title} » : un choix n'a pas de nom.` });
      else if (seen.has(k)) names.push({ groupId: g.key, title: g.title, level: "erreur", code: "doublon", message: `« ${g.title} » : « ${c.name.trim()} » est écrit deux fois.` });
      seen.add(k);
    }
  });
  const issues = [...all, ...names];
  return { pricesMissing: pricesMissing(lot), pending: lotPending(lot), errors: issues.filter((i) => i.level === "erreur"), warnings: issues.filter((i) => i.level === "avertissement") };
}

export const canValidate = (lot: Lot) => { const i = lotIssues(lot); return i.pricesMissing === 0 && i.errors.length === 0; };

// ─── Actions (une copie de l'état à chaque fois) ─────────────────────────────

function withLot(s: EditorState, lotKey: string, fn: (next: EditorState, lot: Lot) => void): EditorState {
  const next = clone(s);
  const lot = findLot(next, lotKey);
  if (lot) fn(next, lot);
  return next;
}

/** Valide un lot : seulement si aucun prix ne manque et si la structure tient. Tout ce qui était à confirmer l'est. */
export function validateLot(s: EditorState, lotKey: string): EditorState {
  return withLot(s, lotKey, (_n, lot) => {
    if (!canValidate(lot)) return;
    eachGroup(lot.groups, (g) => { g.confirmed = true; });
    lot.validated = true;
  });
}

export const reopenLot = (s: EditorState, lotKey: string) => withLot(s, lotKey, (_n, lot) => { lot.validated = false; });

export function removeArticle(s: EditorState, articleId: string): EditorState {
  const next = clone(s);
  const lot = lotOfArticle(next, articleId);
  if (!lot) return next;
  lot.articleIds = lot.articleIds.filter((id) => id !== articleId);
  if (lot.suggestedIds.includes(articleId)) next.stats.suggestedRemoved++;
  lot.suggestedIds = lot.suggestedIds.filter((id) => id !== articleId);
  next.unplaced.push(articleId);
  if (lot.articleIds.length === 0) next.lots = next.lots.filter((l) => l !== lot && l.key !== lot.key);
  return next;
}

/** Ajoute un article (non rangé, ou pris dans un autre lot) à un lot : il prend les options de ce lot. */
export function addArticle(s: EditorState, lotKey: string, articleId: string): EditorState {
  const next = clone(s);
  const dst = findLot(next, lotKey);
  if (!dst || dst.articleIds.includes(articleId)) return next;
  next.unplaced = next.unplaced.filter((id) => id !== articleId);
  const src = lotOfArticle(next, articleId);
  if (src) {
    src.articleIds = src.articleIds.filter((id) => id !== articleId);
    src.suggestedIds = src.suggestedIds.filter((id) => id !== articleId);
    if (src.articleIds.length === 0) next.lots = next.lots.filter((l) => l.key !== src.key);
  }
  dst.articleIds.push(articleId);
  next.stats.added++;
  return next;
}

/** Réunit deux lots : les articles du second prennent les options du premier. */
export function mergeLots(s: EditorState, intoKey: string, fromKey: string): EditorState {
  const next = clone(s);
  const into = findLot(next, intoKey), from = findLot(next, fromKey);
  if (!into || !from || into === from) return next;
  into.articleIds.push(...from.articleIds);
  into.suggestedIds.push(...from.suggestedIds);
  into.label = `${into.label} et ${from.label.charAt(0).toLowerCase()}${from.label.slice(1)}`;
  next.lots = next.lots.filter((l) => l.key !== fromKey);
  next.stats.merges++;
  return next;
}

/** Sort un article d'un lot : il a d'autres choix, il aura son propre lot, avec une copie des options pour partir de quelque chose. */
export function splitArticle(s: EditorState, articleId: string): EditorState {
  const next = clone(s);
  const src = lotOfArticle(next, articleId);
  if (!src || src.articleIds.length < 2) return next;
  src.articleIds = src.articleIds.filter((id) => id !== articleId);
  src.suggestedIds = src.suggestedIds.filter((id) => id !== articleId);
  let seq = next.seq;
  const rekey = (gs: DraftGroup[]): DraftGroup[] => gs.map((g) => ({ ...g, key: `g${++seq}`, choices: g.choices.map((c) => ({ ...c, key: `c${++seq}`, groups: rekey(c.groups) })) }));
  const groups = rekey(src.groups);
  next.seq = seq;
  const lot: Lot = { ...clone(src), key: `lot${++next.seq}`, label: next.articles[articleId]?.name ?? "Plat", articleIds: [articleId], suggestedIds: [], groups, validated: false, proposed: countChoices(groups), edits: 0, pricesSet: 0, viande: src.viande };
  next.lots.splice(next.lots.indexOf(findLot(next, src.key)!) + 1, 0, lot);
  next.stats.splits++;
  return next;
}

export function renameLot(s: EditorState, lotKey: string, label: string): EditorState {
  return withLot(s, lotKey, (_n, lot) => { lot.label = label; });
}

export type GroupPatch = Partial<Pick<DraftGroup, "title" | "kind" | "min" | "max">>;

export function updateGroup(s: EditorState, lotKey: string, groupKey: string, patch: GroupPatch): EditorState {
  return withLot(s, lotKey, (_n, lot) => {
    const g = findGroup(lot, groupKey);
    if (!g) return;
    if (patch.title !== undefined) g.title = patch.title;
    if (patch.kind !== undefined && patch.kind !== g.kind) {
      g.kind = patch.kind;
      g.confirmed = true;
      if (g.kind === "retrait") {
        // « Sans » : gratuit, sans limite, rien d'autre à demander, imprimé en grand sur le ticket.
        g.min = 0; g.max = null;
        g.choices.forEach((c) => { c.priceDelta = 0; c.maxQty = 1; c.isDefault = false; c.groups = []; });
      } else if (g.kind === "inclus") g.choices.forEach((c) => { if (c.priceDelta === null) c.priceDelta = 0; });
      else g.choices.forEach((c) => { if (c.priceDelta === 0 && c.origin === "pack" && !c.isDefault) c.priceDelta = null; });
    }
    if (patch.min !== undefined) { g.min = Math.max(0, Math.floor(patch.min) || 0); if (g.max !== null && g.max < g.min) g.max = g.min; }
    if (patch.max !== undefined) { g.max = patch.max === null ? null : Math.max(1, Math.floor(patch.max) || 1); if (g.max !== null && g.min > g.max) g.min = g.max; }
    lot.edits++;
  });
}

export function confirmGroup(s: EditorState, lotKey: string, groupKey: string): EditorState {
  return withLot(s, lotKey, (_n, lot) => { const g = findGroup(lot, groupKey); if (g) g.confirmed = true; });
}

export type ChoicePatch = Partial<Pick<DraftChoice, "name" | "priceDelta" | "maxQty" | "isDefault" | "keep">>;

export function updateChoice(s: EditorState, lotKey: string, choiceKey: string, patch: ChoicePatch): EditorState {
  return withLot(s, lotKey, (_n, lot) => {
    const f = findChoice(lot, choiceKey);
    if (!f) return;
    const { choice: c, group: g } = f;
    if (patch.priceDelta !== undefined) {
      const v = patch.priceDelta === null ? null : Math.min(100, Math.max(0, Math.round(patch.priceDelta * 100) / 100));
      if (c.priceDelta === null && v !== null) lot.pricesSet++; else if (c.priceDelta !== v) lot.edits++;
      c.priceDelta = g.kind === "retrait" ? 0 : v;
    }
    if (patch.name !== undefined) { c.name = patch.name; lot.edits++; }
    if (patch.maxQty !== undefined) { c.maxQty = Math.min(20, Math.max(1, Math.floor(patch.maxQty) || 1)); lot.edits++; }
    if (patch.isDefault !== undefined) { c.isDefault = patch.isDefault; lot.edits++; }
    if (patch.keep !== undefined) { c.keep = patch.keep; lot.edits++; }
  });
}

export function addChoice(s: EditorState, lotKey: string, groupKey: string): EditorState {
  return withLot(s, lotKey, (next, lot) => {
    const g = findGroup(lot, groupKey);
    if (!g) return;
    g.choices.push({ key: `c${++next.seq}`, name: "", priceDelta: g.kind === "extra" || g.kind === "variante" ? null : 0, maxQty: 1, isDefault: false, keep: true, origin: "ajout", groups: [] });
    lot.edits++;
  });
}

export function addGroup(s: EditorState, lotKey: string): EditorState {
  return withLot(s, lotKey, (next, lot) => {
    lot.groups.push({
      key: `g${++next.seq}`, title: "Nouvelle liste de choix", kind: "extra", min: 0, max: null, guess: false, confirmed: true,
      choices: [{ key: `c${++next.seq}`, name: "", priceDelta: null, maxQty: 1, isDefault: false, keep: true, origin: "ajout", groups: [] }],
    });
    lot.edits++;
  });
}

export function removeGroup(s: EditorState, lotKey: string, groupKey: string): EditorState {
  return withLot(s, lotKey, (_n, lot) => {
    const drop = (gs: DraftGroup[]): DraftGroup[] => gs.filter((g) => g.key !== groupKey).map((g) => ({ ...g, choices: g.choices.map((c) => ({ ...c, groups: drop(c.groups) })) }));
    lot.groups = drop(lot.groups);
    lot.edits++;
  });
}

/** Le même prix pour tous les choix qui en attendent un dans la liste (« toutes mes sauces en plus : 1 € »). */
export function applyBulkPrice(s: EditorState, lotKey: string, groupKey: string, price: number): EditorState {
  return withLot(s, lotKey, (_n, lot) => {
    const g = findGroup(lot, groupKey);
    if (!g || !(price >= 0)) return;
    const v = Math.min(100, Math.round(price * 100) / 100);
    for (const c of g.choices) if (needsPrice(g, c)) { c.priceDelta = v; lot.pricesSet++; }
  });
}

// ─── Réunions proposées ──────────────────────────────────────────────────────

/** Les réunions que nous proposons (mitraillettes et durums…), tant que les deux lots existent et ne sont pas validés. */
export function mergeSuggestions(s: EditorState): { intoKey: string; fromKey: string; text: string }[] {
  const out: { intoKey: string; fromKey: string; text: string }[] = [];
  const keyOf = (family: string) => s.lots.find((l) => !l.validated && (l.family === family || (LOT_OF[l.family as Family] ?? l.family) === family));
  for (const a of AFFINITY) {
    const la = keyOf(a.a), lb = keyOf(a.b);
    if (la && lb && la !== lb) out.push({ intoKey: la.key, fromKey: lb.key, text: a.text });
  }
  return out;
}

// ─── Les descriptions (ADR 0100 §7) ──────────────────────────────────────────

/** Une description telle qu'elle partira : ce que le restaurateur a écrit, sinon ce que nous avons composé d'après le nom. */
export type DescriptionOf = { text: string; source: "generated" | "restaurateur"; conflict?: string };

const cleanDescription = (raw: string) => raw.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION);

function generatedFor(s: EditorState, lot: Lot, articleId: string): Described | null {
  const a = s.articles[articleId];
  if (!a) return null;
  return describeArticle({ id: articleId, name: a.name, category: a.category, family: s.families[articleId] ?? "autre", tone: s.tone, viande: lot.viande });
}

/** La description d'un article de ce lot, ou `null` quand il n'en a pas (boisson, dessert, sauce, formule, inconnu). */
export function descriptionOf(s: EditorState, lot: Lot, articleId: string): DescriptionOf | null {
  if (articleId in s.descEdits) return { text: s.descEdits[articleId], source: "restaurateur" };
  const g = generatedFor(s, lot, articleId);
  return g ? { text: g.text, source: "generated", conflict: g.conflict } : null;
}

/** Les plats d'un lot dont le nom contredit la réponse donnée (« Burger poulet » alors qu'il a dit « bœuf »), sauf s'il a écrit lui-même. */
export function lotConflicts(s: EditorState, lot: Lot): { articleId: string; message: string }[] {
  return lot.articleIds.flatMap((id) => {
    const d = descriptionOf(s, lot, id);
    return d?.conflict ? [{ articleId: id, message: d.conflict }] : [];
  });
}

export const setTone = (s: EditorState, tone: Tone): EditorState => ({ ...clone(s), tone });

export function setViande(s: EditorState, lotKey: string, viande: Viande | null): EditorState {
  return withLot(s, lotKey, (_n, lot) => { lot.viande = viande; });
}

/** Le restaurateur écrit sa propre description. Retaper exactement la nôtre revient à ne rien avoir changé. */
export function editDescription(s: EditorState, articleId: string, text: string): EditorState {
  const next = clone(s);
  const lot = lotOfArticle(next, articleId);
  const clean = cleanDescription(text);
  const gen = lot ? generatedFor(next, lot, articleId) : null;
  if (gen && clean === gen.text) delete next.descEdits[articleId];
  else next.descEdits[articleId] = clean;
  return next;
}

/** Revient à notre description (le restaurateur avait écrit la sienne, ou l'avait vidée). */
export function resetDescription(s: EditorState, articleId: string): EditorState {
  const next = clone(s);
  delete next.descEdits[articleId];
  return next;
}

// ─── Ce qu'on enregistre, ce qu'on mesure ────────────────────────────────────

export type SaveChoice = { name: string; priceDelta: number; maxQty: number; isDefault: boolean; groups: SaveGroup[] };
export type SaveGroup = { title: string; kind: GroupKind; min: number; max: number | null; choices: SaveChoice[] };

export type SaveDescription = { articleId: string; text: string; source: "generated" | "restaurateur" };

export type LotTrace = {
  family: Family; strength: Strength; articles: number; proposed: number; kept: number; added: number; edits: number; pricesSet: number;
  /** Descriptions : composées par nous, gardées telles quelles, réécrites par lui, vidées par lui. */
  descGenerated: number; descKept: number; descEdited: number; descCleared: number;
};
export type SaveLot = { articleIds: string[]; groups: SaveGroup[]; descriptions: SaveDescription[]; trace: LotTrace };

function toSaveGroup(g: DraftGroup): SaveGroup {
  return {
    title: g.title.trim(), kind: g.kind, min: g.min, max: g.max,
    choices: g.choices.filter((c) => c.keep).map((c) => ({ name: c.name.trim(), priceDelta: c.priceDelta ?? 0, maxQty: c.maxQty, isDefault: c.isDefault, groups: c.groups.map(toSaveGroup) })),
  };
}

/** Les lots validés, prêts à écrire. Le serveur les revérifie : ce qui arrive du navigateur n'est jamais cru. */
export function savePayload(s: EditorState): SaveLot[] {
  return s.lots.filter((l) => l.validated).map((lot) => {
    let kept = 0, added = 0;
    eachChoice(lot.groups, (c) => { if (c.keep) { if (c.origin === "pack") kept++; else added++; } });
    const descriptions: SaveDescription[] = [];
    let descGenerated = 0, descKept = 0, descEdited = 0, descCleared = 0;
    for (const articleId of lot.articleIds) {
      const gen = generatedFor(s, lot, articleId);
      if (gen) descGenerated++;
      const d = descriptionOf(s, lot, articleId);
      if (!d) continue;
      descriptions.push({ articleId, text: d.text, source: d.source });
      if (d.source === "generated") descKept++;
      else if (d.text === "") descCleared++;
      else descEdited++;
    }
    return {
      articleIds: lot.articleIds,
      groups: lot.groups.map(toSaveGroup),
      descriptions,
      trace: { family: lot.family, strength: lot.strength, articles: lot.articleIds.length, proposed: lot.proposed, kept, added, edits: lot.edits, pricesSet: lot.pricesSet, descGenerated, descKept, descEdited, descCleared },
    };
  });
}

export type EditorTrace = {
  articles: number; lots: number; lotsSaved: number; unplaced: number;
  suggested: number; suggestedKept: number; added: number; merges: number; splits: number;
  choicesProposed: number; choicesKept: number; lines: number; pricesSet: number;
  descGenerated: number; descKept: number; descEdited: number; descCleared: number;
};

export function traceOf(s: EditorState): EditorTrace {
  const saved = savePayload(s);
  const sum = (f: (t: LotTrace) => number) => saved.reduce((n, l) => n + f(l.trace), 0);
  return {
    articles: Object.keys(s.articles).length, lots: s.lots.length, lotsSaved: saved.length, unplaced: s.unplaced.length,
    suggested: s.stats.suggested, suggestedKept: s.stats.suggested - s.stats.suggestedRemoved, added: s.stats.added, merges: s.stats.merges, splits: s.stats.splits,
    choicesProposed: sum((t) => t.proposed), choicesKept: sum((t) => t.kept), lines: sum((t) => t.edits), pricesSet: sum((t) => t.pricesSet),
    descGenerated: sum((t) => t.descGenerated), descKept: sum((t) => t.descKept), descEdited: sum((t) => t.descEdited), descCleared: sum((t) => t.descCleared),
  };
}
