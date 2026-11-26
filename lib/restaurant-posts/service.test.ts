import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPhoto, checkDraft, countPost, createDraft, deletePost, findOnlinePost, moderatePost, publishPost, reportPost, saveDraft, withdrawPost,
  type PostEvent, type PostsDb,
} from "./service";
import { canSeePosts, canWritePosts, hasPendingChanges } from "./states";
import type { PostRow } from "./types";

const R = "resto";
const GERANT = "gerant-1";
const DISH = "33333333-3333-4333-8333-333333333333";
const dishIds = new Set([DISH]);
const T = (m: number) => new Date(Date.UTC(2026, 10, 26, 10, m));

function memoryDb() {
  const rows = new Map<string, PostRow>();
  const files = new Map<string, Uint8Array>();
  const events: (PostEvent & { at: string })[] = [];
  const bumps: string[] = [];
  const state = { failRemove: false, clock: T(0) };
  const copy = (r: PostRow | undefined) => (r ? (JSON.parse(JSON.stringify(r)) as PostRow) : null);
  const db: PostsDb = {
    async get(restaurantId, id) { const r = rows.get(id); return r && r.restaurant_id === restaurantId ? copy(r) : null; },
    async getById(id) { return copy(rows.get(id)); },
    async getBySlug(restaurantId, slug) { return copy([...rows.values()].find((r) => r.restaurant_id === restaurantId && r.slug === slug)); },
    async insert(row) {
      const full: PostRow = {
        ...row, revision: 1, published_title: null, published_blocks: null, published_revision: null, rights_confirmed_at: null, rights_confirmed_by: null,
        mask_reason: null, masked_at: null, created_at: state.clock.toISOString(), updated_at: state.clock.toISOString(), first_published_at: null, published_at: null, withdrawn_at: null,
      };
      rows.set(row.id, full);
      return copy(full)!;
    },
    async update(id, patch, expect) {
      const r = rows.get(id);
      if (!r || (expect.revision !== undefined && r.revision !== expect.revision) || (expect.status !== undefined && r.status !== expect.status)) return { ok: false, why: "stale" };
      if (patch.slug && [...rows.values()].some((o) => o.id !== id && o.restaurant_id === r.restaurant_id && o.slug === patch.slug)) return { ok: false, why: "slug" };
      Object.assign(r, JSON.parse(JSON.stringify(patch)));
      return { ok: true, row: copy(r)! };
    },
    async remove(id) { rows.delete(id); },
    async addEvent(e) { events.push({ ...e, at: state.clock.toISOString() }); },
    async hasEvent(postId, kind, reason, since) { return events.some((e) => e.postId === postId && e.kind === kind && e.reason === reason && e.at >= since); },
    async bump(postId, day, counter) { bumps.push(`${postId} ${day} ${counter}`); },
    async listFiles(folder) { return [...files.keys()].filter((f) => f.startsWith(`${folder}/`)); },
    async uploadFile(path, data) { files.set(path, data); },
    async removeFiles(paths) { if (state.failRemove) throw new Error("stockage en panne"); for (const p of paths) files.delete(p); },
  };
  return { db, rows, files, events, bumps, state };
}

type Mem = ReturnType<typeof memoryDb>;
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.ok(r.ok, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const text = (title: string, extra: unknown[] = []) => ({ title, blocks: [{ type: "p", text: "Il arrive lundi." }, ...extra] });

async function draft(m: Mem, title = "Nouveau menu") {
  return ok(await createDraft(m.db, { restaurantId: R, userId: GERANT, raw: text(title) })).post;
}
const publish = (m: Mem, id: string, revision: number, over: Partial<Parameters<typeof publishPost>[1]> = {}) =>
  publishPost(m.db, { restaurantId: R, postId: id, userId: GERANT, revision, rightsConfirmed: false, dishIds, now: T(5), ...over });

test("rien n'est public avant « Oui, publier » ; l'adresse vient du titre et ne change plus", async () => {
  const m = memoryDb();
  const d = await draft(m);
  assert.equal(d.status, "brouillon");
  assert.match(d.slug, /^brouillon-/);
  assert.equal(await findOnlinePost(m.db, R, d.slug), null);

  const online = ok(await publish(m, d.id, 1)).post;
  assert.equal(online.slug, "nouveau-menu");
  assert.equal(online.status, "en_ligne");
  assert.equal(online.first_published_at, T(5).toISOString());
  assert.equal((await findOnlinePost(m.db, R, "nouveau-menu"))?.id, d.id);
  assert.equal(await findOnlinePost(m.db, "autre", "nouveau-menu"), null);
  assert.deepEqual(m.events.map((e) => e.kind), ["publie"]);

  // Modifier ne change rien pour le client avant un nouveau « Oui ».
  const edited = ok(await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 1, raw: text("Titre corrigé"), now: T(6) })).post;
  assert.equal(edited.published_title, "Nouveau menu");
  assert.equal(hasPendingChanges(edited), true);
  const again = ok(await publish(m, d.id, 2, { now: T(7) })).post;
  assert.equal(again.published_title, "Titre corrigé");
  assert.equal(again.slug, "nouveau-menu");
  assert.equal(again.first_published_at, T(5).toISOString());
  assert.equal(hasPendingChanges(again), false);
});

test("deux articles au même titre : deux adresses", async () => {
  const m = memoryDb();
  const a = await draft(m);
  const b = await draft(m);
  assert.equal(ok(await publish(m, a.id, 1)).post.slug, "nouveau-menu");
  assert.equal(ok(await publish(m, b.id, 1)).post.slug, "nouveau-menu-2");
});

test("on ne publie que la version relue, et un autre établissement ne voit rien", async () => {
  const m = memoryDb();
  const d = await draft(m);
  ok(await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 1, raw: text("v2") }));
  const stale = await publish(m, d.id, 1);
  assert.equal(stale.ok, false);
  assert.equal(!stale.ok && stale.status, 409);
  const other = await publish(m, d.id, 2, { restaurantId: "autre" });
  assert.equal(!other.ok && other.status, 404);
  const old = await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 1, raw: text("écrasement") });
  assert.equal(!old.ok && old.status, 409);
  assert.equal(m.rows.get(d.id)?.status, "brouillon");
});

test("le contrôle refuse, dit pourquoi, et trace un motif par version du brouillon", async () => {
  const m = memoryDb();
  const d = ok(await createDraft(m.db, { restaurantId: R, userId: GERANT, raw: text("Menu à 9,90 €", [{ type: "p", text: "sans gluten" }]) })).post;
  m.state.clock = T(1);
  const first = ok(await checkDraft(m.db, { restaurantId: R, postId: d.id, userId: GERANT, dishIds }));
  assert.deepEqual(first.issues.map((i) => i.code), ["prix", "allergene"]);
  ok(await checkDraft(m.db, { restaurantId: R, postId: d.id, userId: GERANT, dishIds }));
  const refused = await publish(m, d.id, 1);
  assert.equal(!refused.ok && refused.status, 422);
  assert.deepEqual(m.events.map((e) => [e.kind, e.reason]), [["refuse", "prix"], ["refuse", "allergene"]]);
  assert.equal(m.rows.get(d.id)?.status, "brouillon");
});

test("des photos : la case des droits est exigée, qui et quand sont gardés ; les fichiers inutiles partent", async () => {
  const m = memoryDb();
  const d = await draft(m);
  const a = ok(await addPhoto(m.db, { restaurantId: R, postId: d.id, data: new Uint8Array([1]) })).path;
  const abandoned = ok(await addPhoto(m.db, { restaurantId: R, postId: d.id, data: new Uint8Array([2]) })).path;
  assert.ok(a.startsWith(`${R}/${d.id}/`));
  ok(await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 1, raw: text("Menu", [{ type: "photo", path: a, alt: "Le menu" }]) }));
  const noBox = await publish(m, d.id, 2);
  assert.equal(!noBox.ok && noBox.status, 400);
  const online = ok(await publish(m, d.id, 2, { rightsConfirmed: true })).post;
  assert.equal(online.rights_confirmed_by, GERANT);
  assert.equal(online.rights_confirmed_at, T(5).toISOString());
  assert.equal(m.files.has(a), true);
  assert.equal(m.files.has(abandoned), false);

  // Retirée du brouillon mais encore EN LIGNE : la photo reste ; elle part quand la nouvelle version est publiée.
  ok(await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 2, raw: text("Menu") }));
  assert.equal(m.files.has(a), true);
  const without = ok(await publish(m, d.id, 3)).post;
  assert.equal(m.files.has(a), false);
  assert.equal(without.rights_confirmed_at, null);
});

test("une photo retirée d'un brouillon jamais publié est supprimée tout de suite", async () => {
  const m = memoryDb();
  const d = await draft(m);
  const a = ok(await addPhoto(m.db, { restaurantId: R, postId: d.id, data: new Uint8Array([1]) })).path;
  ok(await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 1, raw: text("m", [{ type: "photo", path: a, alt: "x" }]) }));
  ok(await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 2, raw: text("m") }));
  assert.equal(m.files.size, 0);
});

test("une photo disparue bloque la publication", async () => {
  const m = memoryDb();
  const d = await draft(m);
  const a = ok(await addPhoto(m.db, { restaurantId: R, postId: d.id, data: new Uint8Array([1]) })).path;
  ok(await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 1, raw: text("m", [{ type: "photo", path: a, alt: "x" }]) }));
  m.files.clear();
  const r = await publish(m, d.id, 2, { rightsConfirmed: true });
  assert.equal(!r.ok && r.issues?.[0].code, "photo_absente");
});

test("retirer agit tout de suite ; on peut republier à la même adresse", async () => {
  const m = memoryDb();
  const d = await draft(m);
  assert.equal((await withdrawPost(m.db, { restaurantId: R, postId: d.id, userId: GERANT })).ok, false);
  ok(await publish(m, d.id, 1));
  ok(await withdrawPost(m.db, { restaurantId: R, postId: d.id, userId: GERANT, now: T(8) }));
  assert.equal(await findOnlinePost(m.db, R, "nouveau-menu"), null);
  assert.equal(ok(await publish(m, d.id, 1)).post.slug, "nouveau-menu");
  assert.deepEqual(m.events.map((e) => e.kind), ["publie", "retire", "publie"]);
});

test("supprimer : les photos partent ; si elles résistent, l'article reste et on le dit", async () => {
  const m = memoryDb();
  const d = await draft(m);
  ok(await addPhoto(m.db, { restaurantId: R, postId: d.id, data: new Uint8Array([1]) }));
  m.state.failRemove = true;
  const failed = await deletePost(m.db, { restaurantId: R, postId: d.id, userId: GERANT });
  assert.equal(!failed.ok && failed.status, 500);
  assert.equal(m.rows.size, 1);
  m.state.failRemove = false;
  ok(await deletePost(m.db, { restaurantId: R, postId: d.id, userId: GERANT }));
  assert.equal(m.rows.size + m.files.size, 0);
  assert.deepEqual(m.events.map((e) => [e.kind, e.postId, e.reason]), [["supprime", null, "brouillon"]]);
});

test("masquer : motif obligatoire, le restaurant ne republie pas ; démasquer ne republie rien", async () => {
  const m = memoryDb();
  const d = await draft(m);
  const mask = (action: "masquer" | "demasquer", reason: string) => moderatePost(m.db, { target: { postId: d.id }, action, reason, userId: "plateforme", now: T(9) });
  assert.equal((await mask("masquer", "photo d'un tiers")).ok, false); // un brouillon n'est lu par personne
  ok(await publish(m, d.id, 1));
  assert.equal((await mask("masquer", "  ")).ok, false);
  assert.equal(ok(await moderatePost(m.db, { target: { restaurantId: R, slug: "nouveau-menu" }, action: "masquer", reason: " Photo   d'un tiers ", userId: "plateforme" })).post.mask_reason, "Photo d'un tiers");
  assert.equal(await findOnlinePost(m.db, R, "nouveau-menu"), null);
  const blocked = await publish(m, d.id, 1);
  assert.ok(!blocked.ok && blocked.status === 409 && blocked.error.includes("Photo d'un tiers"), JSON.stringify(blocked));
  assert.equal((await withdrawPost(m.db, { restaurantId: R, postId: d.id, userId: GERANT })).ok, false);
  ok(await saveDraft(m.db, { restaurantId: R, postId: d.id, revision: 1, raw: text("Sans la photo") })); // il peut corriger
  const back = ok(await mask("demasquer", "")).post;
  assert.equal(back.status, "retire");
  assert.equal(back.mask_reason, null);
  assert.deepEqual(m.events.map((e) => e.kind), ["publie", "masque", "demasque"]);
});

test("signaler et compter ne gardent rien sur le lecteur", async () => {
  const m = memoryDb();
  const d = await draft(m);
  ok(await publish(m, d.id, 1));
  const post = (await findOnlinePost(m.db, R, "nouveau-menu"))!;
  await reportPost(m.db, post);
  await countPost(m.db, post, "lecture", "2026-11-26");
  const report = m.events.at(-1)!;
  assert.deepEqual(Object.keys(report).sort(), ["at", "kind", "postId", "restaurantId"]);
  assert.deepEqual(m.bumps, [`${d.id} 2026-11-26 lecture`]);
});

test("gérant et manager écrivent ; ni l'équipe, ni la plateforme à leur place", () => {
  const seat = (over: Partial<Parameters<typeof canWritePosts>[0]>) => ({ isOwner: false, isLegacyAdmin: false, isSuperAdmin: false, seatRole: null, ...over });
  for (const a of [seat({ isOwner: true }), seat({ seatRole: "gerant" }), seat({ seatRole: "manager" }), seat({ isLegacyAdmin: true })]) assert.equal(canWritePosts(a), true);
  assert.equal(canWritePosts(seat({ seatRole: "equipe" })), false);
  assert.equal(canSeePosts(seat({ seatRole: "equipe" })), false);
  assert.equal(canWritePosts(seat({ isSuperAdmin: true })), false);
  assert.equal(canSeePosts(seat({ isSuperAdmin: true })), true);
  assert.equal(canWritePosts(seat({ isSuperAdmin: true, seatRole: "gerant" })), true);
  assert.equal(canSeePosts(seat({})), false);
});
