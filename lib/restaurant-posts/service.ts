// ADR 0111 — les gestes sur un article : écrire, contrôler, publier, retirer, supprimer, masquer, signaler, compter.
// La base et le stockage sont passés en paramètre (db.ts en production, une base en mémoire dans les tests).
// Les droits de la personne sont vérifiés AVANT, par les routes (guard.ts).

import { isPhotoPathOf, parseContent, photoFolder, photoPaths, readBlocks } from "./blocks";
import { checkPublication, type Issue } from "./check";
import { draftSlug, isSlug, slugCandidate, slugify } from "./slug";
import { canMask, canPublish, canUnmask, canWithdraw } from "./states";
import { LIMITS, PHOTO_MAX_FILES, type PostCounter, type PostEventKind, type PostRow, type PostStatus } from "./types";

/** Les tables ou l'espace de stockage n'existent pas encore (migration 20261126-1300 pas appliquée). */
export class PostsUnavailableError extends Error {
  constructor() {
    super("Les articles ne sont pas encore activés.");
    this.name = "PostsUnavailableError";
  }
}

export type PostEvent = { postId: string | null; restaurantId: string; kind: PostEventKind; reason?: string | null; actorId?: string | null };

export type NewPostRow = Pick<PostRow, "id" | "restaurant_id" | "slug" | "lang" | "status" | "draft_title" | "draft_blocks" | "origin" | "author_id">;

export type PostsDb = {
  get(restaurantId: string, postId: string): Promise<PostRow | null>;
  getById(postId: string): Promise<PostRow | null>;
  getBySlug(restaurantId: string, slug: string): Promise<PostRow | null>;
  insert(row: NewPostRow): Promise<PostRow>;
  /**
   * Écrit SEULEMENT si la ligne est encore dans l'état attendu (version du brouillon, état). `stale` : elle a changé
   * entre-temps ; `slug` : l'adresse est déjà prise dans cet établissement.
   */
  update(postId: string, patch: Partial<PostRow>, expect: { revision?: number; status?: PostStatus }): Promise<{ ok: true; row: PostRow } | { ok: false; why: "stale" | "slug" }>;
  remove(postId: string): Promise<void>;
  /** La trace ne fait jamais échouer le geste : une panne se dit au journal. */
  addEvent(event: PostEvent): Promise<void>;
  hasEvent(postId: string, kind: PostEventKind, reason: string, sinceIso: string): Promise<boolean>;
  bump(postId: string, day: string, counter: PostCounter): Promise<void>;
  /** Les fichiers d'un dossier, chemins complets. */
  listFiles(folder: string): Promise<string[]>;
  uploadFile(path: string, data: Uint8Array): Promise<void>;
  /** Échoue (exception) si un fichier n'a pas pu être supprimé. */
  removeFiles(paths: string[]): Promise<void>;
};

export type Failure = { ok: false; status: number; error: string; issues?: Issue[] };
type Done<T> = ({ ok: true } & T) | Failure;

const refuse = (status: number, error: string, issues?: Issue[]): Failure => ({ ok: false, status, error, ...(issues ? { issues } : {}) });
const NOT_FOUND = () => refuse(404, "Article introuvable.");
const STALE = () => refuse(409, "Cet article a changé entre-temps. Recharge la page et relis-le.");
const maskedMessage = (row: PostRow) =>
  `Boosteats a masqué cet article${row.mask_reason ? ` : ${row.mask_reason}` : "."} Il ne peut pas être republié tant que le masquage n'est pas levé.`;

const referenced = (row: Pick<PostRow, "draft_blocks" | "published_blocks">) =>
  new Set([...photoPaths(readBlocks(row.draft_blocks)), ...photoPaths(readBlocks(row.published_blocks))]);

/** Ménage de fichiers qui ne servent plus. Un échec n'annule pas le geste : il se dit au journal, la suppression de l'article les reprendra. */
async function cleanup(db: PostsDb, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await db.removeFiles(paths);
  } catch (e) {
    console.error("[blog] photos inutilisées non supprimées :", (e as Error).message);
  }
}

// ─── Écrire ──────────────────────────────────────────────────────────────────

export async function createDraft(db: PostsDb, p: { restaurantId: string; userId: string; raw: unknown; id?: string }): Promise<Done<{ post: PostRow }>> {
  const parsed = parseContent(p.raw, null);
  if (!parsed.ok) return refuse(400, parsed.error);
  const id = p.id ?? crypto.randomUUID();
  const post = await db.insert({
    id,
    restaurant_id: p.restaurantId,
    slug: draftSlug(crypto.randomUUID()),
    lang: "fr",
    status: "brouillon",
    draft_title: parsed.content.title,
    draft_blocks: parsed.content.blocks,
    origin: "gerant",
    author_id: p.userId,
  });
  return { ok: true, post };
}

/** Garde le brouillon. La version en ligne ne bouge pas (ADR 0111 §6). `revision` : la version que l'écran avait sous les yeux. */
export async function saveDraft(db: PostsDb, p: { restaurantId: string; postId: string; raw: unknown; revision: number; now?: Date }): Promise<Done<{ post: PostRow }>> {
  const row = await db.get(p.restaurantId, p.postId);
  if (!row) return NOT_FOUND();
  if (row.revision !== p.revision) return STALE();
  const parsed = parseContent(p.raw, { restaurantId: p.restaurantId, postId: row.id });
  if (!parsed.ok) return refuse(400, parsed.error);
  const saved = await db.update(
    row.id,
    { draft_title: parsed.content.title, draft_blocks: parsed.content.blocks, revision: row.revision + 1, updated_at: (p.now ?? new Date()).toISOString() },
    { revision: row.revision },
  );
  if (!saved.ok) return STALE();
  const kept = referenced(saved.row);
  await cleanup(db, photoPaths(readBlocks(row.draft_blocks)).filter((path) => !kept.has(path) && isPhotoPathOf(path, p.restaurantId, row.id)));
  return { ok: true, post: saved.row };
}

/** Une photo déjà préparée par le serveur (photo.ts) entre dans le dossier de l'article. Le brouillon ne change pas ici. */
export async function addPhoto(db: PostsDb, p: { restaurantId: string; postId: string; data: Uint8Array }): Promise<Done<{ path: string }>> {
  const row = await db.get(p.restaurantId, p.postId);
  if (!row) return NOT_FOUND();
  const folder = photoFolder(p.restaurantId, row.id);
  let files = await db.listFiles(folder);
  if (files.length >= PHOTO_MAX_FILES) {
    const kept = referenced(row);
    await cleanup(db, files.filter((f) => !kept.has(f)));
    files = await db.listFiles(folder);
    if (files.length >= PHOTO_MAX_FILES) return refuse(409, "Trop de photos envoyées pour cet article. Garde-le en brouillon, puis réessaie.");
  }
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  await db.uploadFile(path, p.data);
  return { ok: true, path };
}

// ─── Contrôler et publier ────────────────────────────────────────────────────

/** Une ligne de trace par motif et par version du brouillon : relire l'aperçu ne gonfle pas le compte. */
async function traceRefusals(db: PostsDb, row: PostRow, userId: string, issues: Issue[]): Promise<void> {
  for (const code of new Set(issues.map((i) => i.code))) {
    if (await db.hasEvent(row.id, "refuse", code, row.updated_at)) continue;
    await db.addEvent({ postId: row.id, restaurantId: row.restaurant_id, kind: "refuse", reason: code, actorId: userId });
  }
}

async function missingPhotos(db: PostsDb, row: PostRow): Promise<Issue[]> {
  const wanted = photoPaths(readBlocks(row.draft_blocks));
  if (wanted.length === 0) return [];
  const files = new Set(await db.listFiles(photoFolder(row.restaurant_id, row.id)));
  return wanted.some((w) => !files.has(w))
    ? [{ code: "photo_absente", message: "Une photo n'a pas été retrouvée : retire son bloc et ajoute-la de nouveau.", block: null }]
    : [];
}

const draftIssues = async (db: PostsDb, row: PostRow, dishIds: ReadonlySet<string> | null) => [
  ...checkPublication({ title: row.draft_title, blocks: readBlocks(row.draft_blocks) }, dishIds),
  ...(await missingPhotos(db, row)),
];

/** « Voir avant de publier » : ce qui bloque, dit AVANT le bouton, et tracé. */
export async function checkDraft(db: PostsDb, p: { restaurantId: string; postId: string; userId: string; dishIds: ReadonlySet<string> | null }): Promise<Done<{ issues: Issue[]; revision: number }>> {
  const row = await db.get(p.restaurantId, p.postId);
  if (!row) return NOT_FOUND();
  const issues = await draftIssues(db, row, p.dishIds);
  await traceRefusals(db, row, p.userId, issues);
  return { ok: true, issues, revision: row.revision };
}

/** « Oui, publier » : la version relue (`revision`), recontrôlée ici. Rien ne devient public autrement. */
export async function publishPost(
  db: PostsDb,
  p: { restaurantId: string; postId: string; userId: string; revision: number; rightsConfirmed: boolean; dishIds: ReadonlySet<string> | null; now?: Date },
): Promise<Done<{ post: PostRow }>> {
  const row = await db.get(p.restaurantId, p.postId);
  if (!row) return NOT_FOUND();
  if (!canPublish(row.status)) return refuse(409, maskedMessage(row));
  if (row.revision !== p.revision) return STALE();
  const issues = await draftIssues(db, row, p.dishIds);
  if (issues.length > 0) {
    await traceRefusals(db, row, p.userId, issues);
    return refuse(422, "À corriger avant de publier.", issues);
  }
  const blocks = readBlocks(row.draft_blocks);
  const hasPhotos = photoPaths(blocks).length > 0;
  if (hasPhotos && !p.rightsConfirmed) return refuse(400, "Coche la case sur les photos avant de publier.");

  const now = (p.now ?? new Date()).toISOString();
  const patch: Partial<PostRow> = {
    status: "en_ligne",
    published_title: row.draft_title,
    published_blocks: blocks,
    published_revision: row.revision,
    published_at: now,
    first_published_at: row.first_published_at ?? now,
    withdrawn_at: null,
    rights_confirmed_at: hasPhotos ? now : null,
    rights_confirmed_by: hasPhotos ? p.userId : null,
    updated_at: now,
  };
  // L'adresse se fixe à la première publication et ne change plus : un lien partagé reste bon.
  const first = row.first_published_at === null;
  const base = slugify(row.draft_title);
  for (let attempt = 1; attempt <= 30; attempt++) {
    const res = await db.update(row.id, first ? { ...patch, slug: slugCandidate(base, attempt) } : patch, { revision: row.revision, status: row.status });
    if (res.ok) {
      await db.addEvent({ postId: row.id, restaurantId: p.restaurantId, kind: "publie", actorId: p.userId });
      const kept = referenced(res.row);
      try {
        await cleanup(db, (await db.listFiles(photoFolder(p.restaurantId, row.id))).filter((f) => !kept.has(f)));
      } catch (e) {
        console.error("[blog] ménage après publication impossible :", (e as Error).message);
      }
      return { ok: true, post: res.row };
    }
    if (res.why !== "slug") return STALE();
  }
  return refuse(409, "Beaucoup d'articles portent déjà ce titre : change-le un peu.");
}

/** « Retirer de la page » : agit tout de suite. */
export async function withdrawPost(db: PostsDb, p: { restaurantId: string; postId: string; userId: string; now?: Date }): Promise<Done<{ post: PostRow }>> {
  const row = await db.get(p.restaurantId, p.postId);
  if (!row) return NOT_FOUND();
  if (!canWithdraw(row.status)) return refuse(409, "Cet article n'est pas en ligne.");
  const now = (p.now ?? new Date()).toISOString();
  const res = await db.update(row.id, { status: "retire", withdrawn_at: now, updated_at: now }, { status: "en_ligne" });
  if (!res.ok) return STALE();
  await db.addEvent({ postId: row.id, restaurantId: p.restaurantId, kind: "retire", actorId: p.userId });
  return { ok: true, post: res.row };
}

/** Supprimer : les photos d'abord. Si elles résistent, l'article reste et on le dit — jamais des photos oubliées. */
export async function deletePost(db: PostsDb, p: { restaurantId: string; postId: string; userId: string }): Promise<Done<object>> {
  const row = await db.get(p.restaurantId, p.postId);
  if (!row) return NOT_FOUND();
  try {
    const folder = photoFolder(p.restaurantId, row.id);
    const files = new Set([...(await db.listFiles(folder)), ...referenced(row)]);
    if (files.size > 0) await db.removeFiles([...files]);
  } catch (e) {
    if (e instanceof PostsUnavailableError) throw e;
    console.error("[blog] suppression : photos non supprimées :", (e as Error).message);
    return refuse(500, "Les photos n'ont pas pu être supprimées, l'article est gardé. Réessaie.");
  }
  await db.remove(row.id);
  await db.addEvent({ postId: null, restaurantId: p.restaurantId, kind: "supprime", reason: row.status, actorId: p.userId });
  return { ok: true };
}

// ─── La plateforme : masquer, rien d'autre ───────────────────────────────────

export type ModerationTarget = { postId: string } | { restaurantId: string; slug: string };

export async function moderatePost(
  db: PostsDb,
  p: { target: ModerationTarget; action: "masquer" | "demasquer"; reason: string; userId: string; now?: Date },
): Promise<Done<{ post: PostRow }>> {
  const row = "postId" in p.target ? await db.getById(p.target.postId) : await db.getBySlug(p.target.restaurantId, p.target.slug);
  if (!row) return NOT_FOUND();
  const now = (p.now ?? new Date()).toISOString();
  const reason = p.reason.replace(/\s+/g, " ").trim();
  if (p.action === "masquer") {
    if (reason.length < 3 || reason.length > LIMITS.maskReason) return refuse(400, `Écris le motif que le gérant lira (3 à ${LIMITS.maskReason} caractères).`);
    if (!canMask(row.status)) return refuse(409, "Seul un article en ligne ou retiré peut être masqué.");
    const res = await db.update(row.id, { status: "masque", mask_reason: reason, masked_at: now, updated_at: now }, { status: row.status });
    if (!res.ok) return STALE();
    await db.addEvent({ postId: row.id, restaurantId: row.restaurant_id, kind: "masque", reason, actorId: p.userId });
    return { ok: true, post: res.row };
  }
  if (!canUnmask(row.status)) return refuse(409, "Cet article n'est pas masqué.");
  // Lever le masquage ne republie rien : l'article revient « retiré », c'est le restaurant qui dit « Oui, publier ».
  const res = await db.update(row.id, { status: "retire", mask_reason: null, masked_at: null, withdrawn_at: now, updated_at: now }, { status: "masque" });
  if (!res.ok) return STALE();
  await db.addEvent({ postId: row.id, restaurantId: row.restaurant_id, kind: "demasque", reason: reason.slice(0, LIMITS.maskReason) || null, actorId: p.userId });
  return { ok: true, post: res.row };
}

// ─── Le lecteur : signaler, compter. Rien sur lui n'est gardé. ────────────────

/** L'article que des clients peuvent lire à cette adresse, ou rien. */
export async function findOnlinePost(db: PostsDb, restaurantId: string, slug: unknown): Promise<PostRow | null> {
  if (!isSlug(slug)) return null;
  const row = await db.getBySlug(restaurantId, slug);
  return row && row.status === "en_ligne" ? row : null;
}

export async function reportPost(db: PostsDb, post: PostRow): Promise<void> {
  await db.addEvent({ postId: post.id, restaurantId: post.restaurant_id, kind: "signale" });
  console.warn(`[blog] article signalé : restaurant=${post.restaurant_id} article=${post.id} adresse=${post.slug}`);
}

export async function countPost(db: PostsDb, post: PostRow, counter: PostCounter, day: string): Promise<void> {
  await db.bump(post.id, day, counter);
}
