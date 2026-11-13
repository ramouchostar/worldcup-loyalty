import { randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase";
import { isMissingTable } from "./store";
import { MAX_DEPTH, validateTree } from "./model";
import { optionKey } from "./normalize";
import { GROUP_KINDS, type OptionChoice, type OptionGroup } from "./types";
import type { EditorTrace, LotTrace, SaveChoice, SaveGroup, SaveLot } from "./lots";

// Écrire les options réglées par le restaurateur (ADR 0100). Ce qui arrive du navigateur n'est JAMAIS cru : on relit
// la forme, on rejoue la validation du modèle, on vérifie que chaque article est bien celui de l'établissement.
//
// Supabase n'offre pas de transaction côté client. On écrit donc dans cet ordre : les NOUVEAUX groupes d'abord, puis la
// bascule des liens de l'article, puis le ménage des anciens. Si quelque chose échoue avant la bascule, les nouveaux
// groupes sont supprimés (les choix, sous-groupes et liens partent en cascade) et l'ancien réglage reste intact.

export const LIMITS = { lots: 40, groupsPerLot: 30, choicesPerGroup: 80, choicesPerLot: 400, articlesPerLot: 500, nameLength: 80, maxPrice: 100 };

// ─── Lecture stricte de ce que le navigateur envoie ──────────────────────────

export type CheckedPayload = { ok: true; lots: SaveLot[] } | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const intOr = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) ? x : null);

function cleanName(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const s = x.replace(/\s+/g, " ").trim();
  return s.length >= 1 && s.length <= LIMITS.nameLength ? s : null;
}

/** Relit la charge utile et la rend sûre. Les erreurs sont écrites pour être montrées au restaurateur. */
export function checkPayload(raw: unknown): CheckedPayload {
  const errors: string[] = [];
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, errors: ["Rien à enregistrer : valide au moins un groupe."] };
  if (raw.length > LIMITS.lots) return { ok: false, errors: [`Trop de groupes d'un coup (${LIMITS.lots} au plus).`] };

  const seenArticles = new Set<string>();
  const lots: SaveLot[] = [];

  const readGroup = (g: unknown, depth: number, where: string, count: { choices: number }): SaveGroup | null => {
    if (!isObj(g)) { errors.push(`${where} : une liste de choix n'a pas pu être lue.`); return null; }
    const title = cleanName(g.title);
    if (!title) { errors.push(`${where} : une liste de choix n'a pas de nom (ou il dépasse ${LIMITS.nameLength} lettres).`); return null; }
    const here = `${where} › ${title}`;
    if (typeof g.kind !== "string" || !GROUP_KINDS.includes(g.kind as never)) { errors.push(`${here} : genre de choix inconnu.`); return null; }
    const min = intOr(g.min);
    const max = g.max === null ? null : intOr(g.max);
    if (min === null || min < 0 || (g.max !== null && (max === null || max < 1))) { errors.push(`${here} : le minimum et le maximum ne sont pas valides.`); return null; }
    if (!Array.isArray(g.choices) || g.choices.length > LIMITS.choicesPerGroup) { errors.push(`${here} : les choix ne sont pas valides (${LIMITS.choicesPerGroup} au plus).`); return null; }
    const choices: SaveChoice[] = [];
    for (const c of g.choices) {
      if (!isObj(c)) { errors.push(`${here} : un choix n'a pas pu être lu.`); continue; }
      const name = cleanName(c.name);
      if (!name) { errors.push(`${here} : un choix n'a pas de nom.`); continue; }
      const price = c.priceDelta;
      if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > LIMITS.maxPrice) { errors.push(`${here} : « ${name} » doit avoir un prix entre 0 et ${LIMITS.maxPrice} €.`); continue; }
      const maxQty = intOr(c.maxQty);
      if (maxQty === null || maxQty < 1 || maxQty > 20) { errors.push(`${here} : « ${name} » peut être pris de 1 à 20 fois.`); continue; }
      if (typeof c.isDefault !== "boolean") { errors.push(`${here} : « ${name} » n'a pas pu être lu.`); continue; }
      if (++count.choices > LIMITS.choicesPerLot) { errors.push(`${where} : trop de choix dans ce groupe de plats (${LIMITS.choicesPerLot} au plus).`); return null; }
      const subs: SaveGroup[] = [];
      if (Array.isArray(c.groups) && c.groups.length > 0) {
        if (depth + 1 > MAX_DEPTH) errors.push(`${here} : trop de questions imbriquées (${MAX_DEPTH} niveaux au plus).`);
        else for (const sg of c.groups) { const r = readGroup(sg, depth + 1, here, count); if (r) subs.push(r); }
      }
      choices.push({ name, priceDelta: Math.round(price * 100) / 100, maxQty, isDefault: c.isDefault, groups: subs });
    }
    return { title, kind: g.kind as SaveGroup["kind"], min, max, choices };
  };

  raw.forEach((l, i) => {
    const where = `Groupe ${i + 1}`;
    if (!isObj(l)) { errors.push(`${where} : illisible.`); return; }
    const articleIds = Array.isArray(l.articleIds) && l.articleIds.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64) ? (l.articleIds as string[]) : null;
    if (!articleIds || articleIds.length === 0 || articleIds.length > LIMITS.articlesPerLot) { errors.push(`${where} : la liste des plats n'est pas valide.`); return; }
    for (const id of articleIds) {
      if (seenArticles.has(id)) errors.push(`${where} : un plat est dans deux groupes à la fois.`);
      seenArticles.add(id);
    }
    if (!Array.isArray(l.groups) || l.groups.length > LIMITS.groupsPerLot) { errors.push(`${where} : les listes de choix ne sont pas valides (${LIMITS.groupsPerLot} au plus).`); return; }
    const count = { choices: 0 };
    const groups = l.groups.map((g) => readGroup(g, 0, where, count));
    if (groups.some((g) => g === null)) return;
    const trace = isObj(l.trace) ? readLotTrace(l.trace) : null;
    lots.push({ articleIds: [...new Set(articleIds)], groups: groups as SaveGroup[], trace: trace ?? { family: "autre", strength: "faible", articles: articleIds.length, proposed: 0, kept: 0, added: 0, edits: 0, pricesSet: 0 } });
  });
  if (errors.length > 0) return { ok: false, errors };

  // La validation du modèle : la même que celle de l'écran, rejouée ici parce que le navigateur peut mentir.
  let n = 0;
  const toTree = (g: SaveGroup): OptionGroup => ({
    id: `g${++n}`, title: g.title, kind: g.kind, min: g.min, max: g.max,
    choices: g.choices.map((c): OptionChoice => ({ id: `c${++n}`, libraryId: optionKey(c.name), name: c.name, priceDelta: c.priceDelta, maxQty: c.maxQty, isDefault: c.isDefault, isAvailable: true, groups: c.groups.map(toTree) })),
  });
  lots.forEach((lot, i) => {
    const trees = lot.groups.map(toTree);
    for (const issue of validateTree(trees)) if (issue.level === "erreur") errors.push(`Groupe ${i + 1} : ${issue.message}`);
    const dup = (gs: OptionGroup[]) => gs.forEach((g) => {
      const keys = new Set<string>();
      for (const c of g.choices) { if (keys.has(c.libraryId)) errors.push(`Groupe ${i + 1} › ${g.title} : « ${c.name} » est écrit deux fois.`); keys.add(c.libraryId); dup(c.groups); }
    });
    dup(trees);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, lots };
}

function readLotTrace(t: Record<string, unknown>): LotTrace | null {
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 1e6 ? Math.floor(x) : 0);
  const family = typeof t.family === "string" && /^[a-z_]{2,20}$/.test(t.family) ? t.family : "autre";
  const strength = t.strength === "forte" || t.strength === "moyenne" || t.strength === "faible" || t.strength === "aucune" ? t.strength : "faible";
  return { family: family as LotTrace["family"], strength, articles: num(t.articles), proposed: num(t.proposed), kept: num(t.kept), added: num(t.added), edits: num(t.edits), pricesSet: num(t.pricesSet) };
}

// ─── L'accès à la base, derrière une petite interface (testée avec une base en mémoire) ──────────

export class OptionsUnavailableError extends Error {
  constructor() { super("Les options ne sont pas encore activées pour ce compte (migration non appliquée)."); }
}

export type GroupInsert = { id: string; restaurant_id: string; title: string; kind: string; min_choices: number; max_choices: number | null };
export type ChoiceInsert = { id: string; group_id: string; library_id: string; price_delta: number; max_qty: number; is_default: boolean; position: number };
export type ChoiceGroupInsert = { choice_id: string; group_id: string; position: number };
export type ItemLinkInsert = { menu_item_id: string; group_id: string; position: number };

export interface OptionsDb {
  ownedArticleIds(restaurantId: string, ids: string[]): Promise<string[]>;
  linkedGroupIds(articleIds: string[]): Promise<string[]>;
  ensureLibrary(restaurantId: string, entries: { name: string; key: string }[]): Promise<Map<string, string>>;
  insertGroups(rows: GroupInsert[]): Promise<void>;
  insertChoices(rows: ChoiceInsert[]): Promise<void>;
  insertChoiceGroups(rows: ChoiceGroupInsert[]): Promise<void>;
  linkArticles(rows: ItemLinkInsert[]): Promise<void>;
  /** Retire les liens des articles vers tout groupe qui n'est pas dans `keepGroupIds`. */
  unlink(articleIds: string[], keepGroupIds: string[]): Promise<void>;
  childGroupIds(groupIds: string[]): Promise<string[]>;
  itemLinkedGroups(groupIds: string[]): Promise<string[]>;
  choiceReferencedGroups(groupIds: string[]): Promise<string[]>;
  deleteGroups(ids: string[]): Promise<void>;
  writeSetup(row: SetupRow): Promise<boolean>;
}

export type SetupRow = {
  restaurant_id: string; created_by: string; articles_total: number; lots_total: number; lots_saved: number; unplaced: number;
  suggested: number; suggested_kept: number; dishes_added: number; merges: number; splits: number;
  choices_proposed: number; choices_kept: number; lines_changed: number; prices_set: number; detail: LotTrace[];
};

// ─── L'écriture d'un groupe de plats ─────────────────────────────────────────

type Counts = { groups: number; choices: number };

async function cleanup(db: OptionsDb, oldTop: string[]) {
  if (oldTop.length === 0) return;
  const levels: string[][] = [oldTop];
  for (let d = 1; d <= MAX_DEPTH; d++) {
    const kids = await db.childGroupIds(levels[d - 1]);
    if (kids.length === 0) break;
    levels.push(kids);
  }
  // Les anciens groupes de premier niveau qu'aucun article n'utilise plus, puis, niveau par niveau, les sous-groupes
  // que plus aucun choix n'ouvre. Un groupe encore utilisé ailleurs n'est jamais touché.
  const linked = new Set(await db.itemLinkedGroups(oldTop));
  await db.deleteGroups(oldTop.filter((id) => !linked.has(id)));
  for (const level of levels.slice(1)) {
    const referenced = new Set(await db.choiceReferencedGroups(level));
    const usedByArticle = new Set(await db.itemLinkedGroups(level));
    await db.deleteGroups(level.filter((id) => !referenced.has(id) && !usedByArticle.has(id)));
  }
}

// Quand l'écriture échoue, on veut savoir À QUELLE ÉTAPE et ce que dit la base : l'étape est collée à l'erreur ici, et
// l'écran la montre dans « détail pour l'équipe » (sans elle il faudrait fouiller les journaux du serveur).
type StepError = Error & { step?: string };
const withStep = (e: unknown, step: string): StepError => {
  const err: StepError = e instanceof Error ? e : new Error(String(e));
  if (!err.step) err.step = step;
  return err;
};
async function at<T>(step: string, work: Promise<T>): Promise<T> {
  try { return await work; } catch (e) { throw withStep(e, step); }
}
/** Une ligne lisible de ce qui a échoué : « [écriture des choix] message de la base ». Pour la console, jamais pour un membre. */
export function describeFailure(e: unknown): string {
  const err = e as StepError | null;
  const msg = (err?.message ?? String(e)).replace(/\s+/g, " ").slice(0, 240);
  return err?.step ? `[${err.step}] ${msg}` : msg;
}

async function writeLot(db: OptionsDb, restaurantId: string, lot: SaveLot): Promise<Counts> {
  const old = await at("lecture des anciens groupes", db.linkedGroupIds(lot.articleIds));
  if (lot.groups.length === 0) {
    // « Ces plats n'ont pas de choix » : on retire ce qui existait.
    await at("retrait des liens", db.unlink(lot.articleIds, []));
    await cleanup(db, old).catch((e) => console.error("[menu-options] ménage des anciens groupes :", e));
    return { groups: 0, choices: 0 };
  }

  const entries = new Map<string, string>();
  const collect = (gs: SaveGroup[]) => gs.forEach((g) => g.choices.forEach((c) => { if (!entries.has(optionKey(c.name))) entries.set(optionKey(c.name), c.name); collect(c.groups); }));
  collect(lot.groups);
  const library = await at("bibliothèque d'options", db.ensureLibrary(restaurantId, [...entries].map(([key, name]) => ({ key, name }))));

  const groups: GroupInsert[] = [], choices: ChoiceInsert[] = [], choiceGroups: ChoiceGroupInsert[] = [];
  const build = (g: SaveGroup): string => {
    const id = randomUUID();
    groups.push({ id, restaurant_id: restaurantId, title: g.title, kind: g.kind, min_choices: g.min, max_choices: g.max });
    g.choices.forEach((c, i) => {
      const cid = randomUUID();
      const libraryId = library.get(optionKey(c.name));
      if (!libraryId) throw new Error(`menu_options : « ${c.name} » n'a pas pu être ajouté à la bibliothèque.`);
      choices.push({ id: cid, group_id: id, library_id: libraryId, price_delta: c.priceDelta, max_qty: c.maxQty, is_default: c.isDefault, position: i });
      c.groups.forEach((sg, j) => choiceGroups.push({ choice_id: cid, group_id: build(sg), position: j }));
    });
    return id;
  };
  const top = lot.groups.map(build);
  const created = groups.map((g) => g.id);

  try {
    await at("écriture des listes de choix", db.insertGroups(groups));
    await at("écriture des choix", db.insertChoices(choices));
    await at("écriture des sous-questions", db.insertChoiceGroups(choiceGroups));
    await at("liens avec les plats", db.linkArticles(lot.articleIds.flatMap((articleId) => top.map((groupId, position) => ({ menu_item_id: articleId, group_id: groupId, position })))));
    // La bascule : les articles n'ont plus que les nouveaux groupes. Si elle échoue, on revient à l'ancien réglage.
    await at("bascule des liens", db.unlink(lot.articleIds, top));
  } catch (e) {
    await db.deleteGroups(created).catch((err) => console.error("[menu-options] retour arrière impossible :", err));
    throw e;
  }
  await cleanup(db, old).catch((e) => console.error("[menu-options] ménage des anciens groupes :", e));
  return { groups: groups.length, choices: choices.length };
}

export type SaveOutcome =
  | { ok: true; lots: number; articles: number; groups: number; choices: number; traceSaved: boolean }
  | { ok: false; status: number; error: string; details?: string[]; savedLots?: number; detail?: string };

/** Enregistre les groupes de plats validés. Les groupes déjà écrits restent écrits si un suivant échoue : on le dit. */
export async function saveLots(db: OptionsDb, restaurantId: string, rawLots: unknown, rawTrace: unknown, userId: string): Promise<SaveOutcome> {
  const checked = checkPayload(rawLots);
  if (!checked.ok) return { ok: false, status: 400, error: "Certains choix ne sont pas valides.", details: checked.errors.slice(0, 12) };

  const wanted = [...new Set(checked.lots.flatMap((l) => l.articleIds))];

  let groups = 0, choices = 0, saved = 0;
  try {
    const owned = new Set(await at("vérification des plats", db.ownedArticleIds(restaurantId, wanted)));
    if (wanted.some((id) => !owned.has(id))) return { ok: false, status: 400, error: "Un des plats n'appartient pas à cet établissement. Recharge la page." };
    for (const lot of checked.lots) {
      const c = await writeLot(db, restaurantId, lot);
      groups += c.groups; choices += c.choices; saved++;
    }
  } catch (e) {
    if (e instanceof OptionsUnavailableError) return { ok: false, status: 503, error: e.message };
    console.error("[menu-options] enregistrement :", e);
    return { ok: false, status: 500, error: saved > 0 ? `L'enregistrement s'est arrêté après ${saved} groupe(s). Réessaie : ce qui est déjà enregistré est gardé.` : "L'enregistrement a échoué. Rien n'a été changé. Réessaie.", savedLots: saved, detail: describeFailure(e) };
  }

  // La trace (ADR 0065) : jamais bloquante, jamais silencieuse (le résultat dit si elle est partie).
  const t = isObj(rawTrace) ? rawTrace : {};
  const n = (k: string) => (typeof t[k] === "number" && Number.isFinite(t[k] as number) && (t[k] as number) >= 0 && (t[k] as number) < 1e6 ? Math.floor(t[k] as number) : 0);
  const detail = checked.lots.map((l) => l.trace);
  let traceSaved = false;
  try {
    traceSaved = await db.writeSetup({
      restaurant_id: restaurantId, created_by: userId, articles_total: n("articles"), lots_total: n("lots"), lots_saved: saved, unplaced: n("unplaced"),
      suggested: n("suggested"), suggested_kept: n("suggestedKept"), dishes_added: n("added"), merges: n("merges"), splits: n("splits"),
      choices_proposed: detail.reduce((a, d) => a + d.proposed, 0), choices_kept: detail.reduce((a, d) => a + d.kept, 0),
      lines_changed: detail.reduce((a, d) => a + d.edits, 0), prices_set: detail.reduce((a, d) => a + d.pricesSet, 0), detail,
    });
  } catch (e) {
    console.error("[menu-options] trace non enregistrée :", e);
  }
  if (!traceSaved) console.warn("[menu-options] trace non enregistrée (table menu_option_setups absente ?)");
  return { ok: true, lots: saved, articles: wanted.length, groups, choices, traceSaved };
}

export type { EditorTrace };

// ─── L'adaptateur Supabase ───────────────────────────────────────────────────

const chunks = <T,>(xs: T[], size = 100): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size)); return out; };

export function supabaseOptionsDb(): OptionsDb {
  const admin = createAdminClient();
  const check = (what: string, error: { code?: string; message: string } | null) => {
    if (!error) return;
    if (isMissingTable(error)) throw new OptionsUnavailableError();
    throw new Error(`menu_options (${what}) : ${error.message}`);
  };
  const selectIn = async (table: string, select: string, column: string, values: string[], extra?: (q: any) => any): Promise<Record<string, unknown>[]> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const out: Record<string, unknown>[] = [];
    for (const part of chunks(values)) {
      let q = admin.from(table).select(select).in(column, part);
      if (extra) q = extra(q);
      const r = await q;
      check(table, r.error);
      out.push(...((r.data ?? []) as unknown as Record<string, unknown>[]));
    }
    return out;
  };
  const insert = async (table: string, rows: object[]) => {
    for (const part of chunks(rows, 200)) check(`écriture ${table}`, (await admin.from(table).insert(part)).error);
  };

  return {
    async ownedArticleIds(restaurantId, ids) {
      return (await selectIn("menu_items", "id", "id", ids, (q) => q.eq("restaurant_id", restaurantId))).map((r) => r.id as string);
    },
    async linkedGroupIds(articleIds) {
      return [...new Set((await selectIn("menu_item_option_groups", "group_id", "menu_item_id", articleIds)).map((r) => r.group_id as string))];
    },
    async ensureLibrary(restaurantId, entries) {
      const keys = entries.map((e) => e.key);
      const read = async () => new Map((await selectIn("menu_option_library", "id, name_key", "name_key", keys, (q) => q.eq("restaurant_id", restaurantId))).map((r) => [r.name_key as string, r.id as string]));
      const have = await read();
      const missing = entries.filter((e) => !have.has(e.key)).map((e) => ({ restaurant_id: restaurantId, name: e.name, name_key: e.key }));
      if (missing.length > 0) {
        // `ignoreDuplicates` : deux enregistrements en même temps ne se gênent pas.
        check("bibliothèque", (await admin.from("menu_option_library").upsert(missing, { onConflict: "restaurant_id,name_key", ignoreDuplicates: true })).error);
      }
      return missing.length > 0 ? read() : have;
    },
    insertGroups: (rows) => insert("menu_option_groups", rows),
    insertChoices: (rows) => insert("menu_option_choices", rows),
    insertChoiceGroups: (rows) => insert("menu_option_choice_groups", rows),
    linkArticles: (rows) => insert("menu_item_option_groups", rows),
    async unlink(articleIds, keepGroupIds) {
      for (const part of chunks(articleIds)) {
        let q = admin.from("menu_item_option_groups").delete().in("menu_item_id", part);
        if (keepGroupIds.length > 0) q = q.not("group_id", "in", `(${keepGroupIds.join(",")})`);
        check("liens des articles", (await q).error);
      }
    },
    async childGroupIds(groupIds) {
      const choiceIds = (await selectIn("menu_option_choices", "id", "group_id", groupIds)).map((r) => r.id as string);
      return [...new Set((await selectIn("menu_option_choice_groups", "group_id", "choice_id", choiceIds)).map((r) => r.group_id as string))];
    },
    async itemLinkedGroups(groupIds) {
      return [...new Set((await selectIn("menu_item_option_groups", "group_id", "group_id", groupIds)).map((r) => r.group_id as string))];
    },
    async choiceReferencedGroups(groupIds) {
      return [...new Set((await selectIn("menu_option_choice_groups", "group_id", "group_id", groupIds)).map((r) => r.group_id as string))];
    },
    async deleteGroups(ids) {
      for (const part of chunks(ids)) check("suppression des groupes", (await admin.from("menu_option_groups").delete().in("id", part)).error);
    },
    async writeSetup(row) {
      const { error } = await admin.from("menu_option_setups").insert(row);
      if (error && isMissingTable(error)) return false;
      if (error) throw new Error(`menu_option_setups : ${error.message}`);
      return true;
    },
  };
}

// ─── Lecture pour l'écran : quels articles ont déjà des options ? ────────────

/** Nombre de listes de choix par article de l'établissement. `null` = tables absentes (migration pas appliquée) : l'écran le dit. */
export async function countGroupsByArticle(restaurantId: string): Promise<Map<string, number> | null> {
  const admin = createAdminClient();
  const r = await admin.from("menu_item_option_groups").select("menu_item_id, menu_items!inner(restaurant_id)").eq("menu_items.restaurant_id", restaurantId);
  if (r.error) {
    if (isMissingTable(r.error)) return null;
    throw new Error(`menu_options (lecture) : ${r.error.message}`);
  }
  const counts = new Map<string, number>();
  for (const row of (r.data ?? []) as unknown as { menu_item_id: string }[]) counts.set(row.menu_item_id, (counts.get(row.menu_item_id) ?? 0) + 1);
  return counts;
}
