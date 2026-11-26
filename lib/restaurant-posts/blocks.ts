// ADR 0111 §4 — la FORME d'un article : ce que le serveur accepte d'enregistrer. PUR, testé.
// Un brouillon peut être incomplet (paragraphe vide, plat pas encore choisi) ; il ne peut jamais être hors forme
// (bloc inconnu, trop long, trop de blocs, photo d'un autre article). Le contrôle de publication est ailleurs (check.ts).

import { LIMITS, type PostBlock, type PostContent } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Caractères invisibles ou de contrôle (hors saut de ligne et tabulation) : retirés, ils cacheraient un mot au contrôle.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g;

/** Texte sur une ligne : ni retour à la ligne, ni caractère invisible, espaces resserrés. */
const line = (v: string) => v.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
/** Paragraphe : les retours à la ligne restent (deux au plus d'affilée). */
const prose = (v: string) =>
  v.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** Le dossier des photos d'un article : jamais celui d'un autre établissement ni d'un autre article. */
export const photoFolder = (restaurantId: string, postId: string) => `${restaurantId}/${postId}`;
const PHOTO_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
export function isPhotoPathOf(path: string, restaurantId: string, postId: string): boolean {
  const prefix = `${photoFolder(restaurantId, postId)}/`;
  return path.startsWith(prefix) && PHOTO_FILE.test(path.slice(prefix.length));
}

export type ParseResult = { ok: true; content: PostContent } | { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });

const text = (v: unknown, max: number, clean: (s: string) => string): { ok: true; value: string } | { ok: false; long: boolean } => {
  if (typeof v !== "string") return { ok: false, long: false };
  const value = clean(v);
  return value.length > max ? { ok: false, long: true } : { ok: true, value };
};

/**
 * Relit ce que le navigateur envoie. Rien n'est tronqué en silence : trop long = refus qui dit où.
 * `owner` : l'article dans lequel on écrit ; `null` à la création (aucune photo ne peut encore exister).
 */
export function parseContent(raw: unknown, owner: { restaurantId: string; postId: string } | null): ParseResult {
  if (!isRecord(raw) || !Array.isArray(raw.blocks)) return fail("Article illisible.");
  const title = text(raw.title, LIMITS.title, line);
  if (!title.ok) return fail(title.long ? `Le titre dépasse ${LIMITS.title} caractères.` : "Titre illisible.");
  if (raw.blocks.length > LIMITS.blocks) return fail(`Un article a ${LIMITS.blocks} blocs au plus.`);

  const blocks: PostBlock[] = [];
  let photos = 0;
  for (const [i, b] of raw.blocks.entries()) {
    const where = `Bloc ${i + 1}`;
    if (!isRecord(b)) return fail(`${where} : illisible.`);
    if (b.type === "p" || b.type === "h2") {
      const max = b.type === "p" ? LIMITS.paragraph : LIMITS.heading;
      const t = text(b.text, max, b.type === "p" ? prose : line);
      if (!t.ok) return fail(t.long ? `${where} : ${max} caractères au plus.` : `${where} : illisible.`);
      blocks.push({ type: b.type, text: t.value });
    } else if (b.type === "ul") {
      if (!Array.isArray(b.items)) return fail(`${where} : illisible.`);
      const items: string[] = [];
      for (const raw of b.items) {
        const t = text(raw, LIMITS.listItem, line);
        if (!t.ok) return fail(t.long ? `${where} : ${LIMITS.listItem} caractères au plus par point.` : `${where} : illisible.`);
        if (t.value !== "") items.push(t.value);
      }
      if (items.length > LIMITS.listItems) return fail(`${where} : ${LIMITS.listItems} points au plus.`);
      blocks.push({ type: "ul", items });
    } else if (b.type === "photo") {
      if (!owner || typeof b.path !== "string" || !isPhotoPathOf(b.path, owner.restaurantId, owner.postId)) return fail(`${where} : photo inconnue.`);
      const alt = text(b.alt, LIMITS.alt, line);
      if (!alt.ok) return fail(alt.long ? `${where} : la description tient en ${LIMITS.alt} caractères.` : `${where} : illisible.`);
      if (++photos > LIMITS.photos) return fail(`Un article a ${LIMITS.photos} photos au plus.`);
      blocks.push({ type: "photo", path: b.path, alt: alt.value });
    } else if (b.type === "dish") {
      if (b.itemId !== "" && !isUuid(b.itemId)) return fail(`${where} : plat inconnu.`);
      blocks.push({ type: "dish", itemId: b.itemId as string });
    } else {
      return fail(`${where} : type inconnu.`);
    }
  }
  return { ok: true, content: { title: title.value, blocks } };
}

/** Les blocs lus de la base : on ne croit que les formes connues (une ligne abîmée n'abîme pas la page). */
export function readBlocks(raw: unknown): PostBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((b): b is PostBlock => {
    if (!isRecord(b)) return false;
    if (b.type === "p" || b.type === "h2") return typeof b.text === "string";
    if (b.type === "ul") return Array.isArray(b.items) && b.items.every((x) => typeof x === "string");
    if (b.type === "photo") return typeof b.path === "string" && typeof b.alt === "string";
    return b.type === "dish" && typeof b.itemId === "string";
  });
}

export const photoPaths = (blocks: PostBlock[] | null | undefined): string[] =>
  (blocks ?? []).flatMap((b) => (b.type === "photo" ? [b.path] : []));

/** Les premières lignes du texte, pour la liste des articles : le premier paragraphe, sinon la première liste. */
export function excerpt(blocks: PostBlock[], max = 120): string {
  const p = blocks.find((b) => b.type === "p" && b.text !== "");
  const ul = blocks.find((b) => b.type === "ul" && b.items.length > 0);
  const raw = (p?.type === "p" ? p.text : ul?.type === "ul" ? ul.items.join(", ") : "").replace(/\s+/g, " ").trim();
  if (raw.length <= max) return raw;
  const cut = raw.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[ ,;:.!?]+$/, "")}…`;
}

/** Deux contenus identiques ? (« des changements attendent ton Oui »). */
export const sameContent = (a: PostContent, b: PostContent): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
// La base (jsonb) ne garde pas l'ordre des clés : on compare une forme à ordre fixe.
const canonical = (c: PostContent) => [
  c.title,
  c.blocks.map((b) => (b.type === "ul" ? [b.type, b.items] : b.type === "photo" ? [b.type, b.path, b.alt] : b.type === "dish" ? [b.type, b.itemId] : [b.type, b.text])),
];
