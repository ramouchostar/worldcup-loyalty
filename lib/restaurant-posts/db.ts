// ADR 0111 — la base et l'espace de stockage des articles (service role uniquement : tables sans policy, bucket privé).
// Table, fonction ou espace absents (migration 20261126-1300 pas appliquée) = `PostsUnavailableError` : le bloc client
// se cache et la console le dit, jamais une erreur obscure.

import { createAdminClient } from "../supabase";
import { PostsUnavailableError, type PostsDb } from "./service";
import { PHOTO_URL_TTL_SECONDS, POST_PHOTO_BUCKET, type PostRow } from "./types";
import { isUuid, readBlocks } from "./blocks";

type DbError = { code?: string; message?: string } | null;

export const isMissingPostTable = (error: DbError) =>
  !!error &&
  (error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /restaurant_post.*(does not exist|schema cache)|Could not find the (table|function).*restaurant_post|Bucket not found/i.test(error.message ?? ""));

const fail = (what: string, error: { code?: string; message?: string }): Error =>
  isMissingPostTable(error) ? new PostsUnavailableError() : new Error(`articles (${what}) : ${error.message}`);

const toRow = (r: unknown): PostRow => {
  const row = r as PostRow;
  return { ...row, draft_blocks: readBlocks(row.draft_blocks), published_blocks: row.published_blocks === null ? null : readBlocks(row.published_blocks) };
};

export function supabasePostsDb(): PostsDb {
  const admin = createAdminClient();
  const posts = () => admin.from("restaurant_posts");
  const bucket = () => admin.storage.from(POST_PHOTO_BUCKET);

  return {
    async get(restaurantId, postId) {
      if (!isUuid(postId)) return null;
      const { data, error } = await posts().select("*").eq("restaurant_id", restaurantId).eq("id", postId).maybeSingle();
      if (error) throw fail("lecture", error);
      return data ? toRow(data) : null;
    },
    async getById(postId) {
      if (!isUuid(postId)) return null;
      const { data, error } = await posts().select("*").eq("id", postId).maybeSingle();
      if (error) throw fail("lecture", error);
      return data ? toRow(data) : null;
    },
    async getBySlug(restaurantId, slug) {
      const { data, error } = await posts().select("*").eq("restaurant_id", restaurantId).eq("slug", slug).maybeSingle();
      if (error) throw fail("adresse", error);
      return data ? toRow(data) : null;
    },
    async insert(row) {
      const { data, error } = await posts().insert(row).select("*").single();
      if (error) throw fail("création", error);
      return toRow(data);
    },
    async update(postId, patch, expect) {
      let q = posts().update(patch).eq("id", postId);
      if (expect.revision !== undefined) q = q.eq("revision", expect.revision);
      if (expect.status !== undefined) q = q.eq("status", expect.status);
      const { data, error } = await q.select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") return { ok: false, why: "slug" };
        throw fail("écriture", error);
      }
      return data ? { ok: true, row: toRow(data) } : { ok: false, why: "stale" };
    },
    async remove(postId) {
      const { error } = await posts().delete().eq("id", postId);
      if (error) throw fail("suppression", error);
    },
    async addEvent(e) {
      const { error } = await admin.from("restaurant_post_events").insert({
        post_id: e.postId,
        restaurant_id: e.restaurantId,
        kind: e.kind,
        reason: e.reason?.slice(0, 300) ?? null,
        actor_id: e.actorId ?? null,
      });
      if (error) console.error(`[blog] trace « ${e.kind} » non écrite :`, error.message);
    },
    async hasEvent(postId, kind, reason, sinceIso) {
      const { data, error } = await admin
        .from("restaurant_post_events")
        .select("id")
        .eq("post_id", postId)
        .eq("kind", kind)
        .eq("reason", reason)
        .gte("created_at", sinceIso)
        .limit(1);
      if (error) {
        console.error("[blog] trace illisible :", error.message);
        return false;
      }
      return (data ?? []).length > 0;
    },
    async bump(postId, day, counter) {
      const { error } = await admin.rpc("bump_restaurant_post_daily", { p_post_id: postId, p_day: day, p_kind: counter });
      if (error) throw fail("compteur", error);
    },
    async listFiles(folder) {
      const { data, error } = await bucket().list(folder, { limit: 100 });
      if (error) throw fail("photos", error);
      return (data ?? []).map((f) => `${folder}/${f.name}`);
    },
    async uploadFile(path, data) {
      const { error } = await bucket().upload(path, data, { contentType: "image/jpeg", upsert: false });
      if (error) throw fail("envoi de la photo", error);
    },
    async removeFiles(paths) {
      const { error } = await bucket().remove(paths);
      if (error) throw fail("suppression des photos", error);
    },
  };
}

/** Des adresses de courte durée pour des photos de l'espace privé. Une photo qu'on ne sait pas signer n'est pas montrée. */
export async function signPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await createAdminClient().storage.from(POST_PHOTO_BUCKET).createSignedUrls(unique, PHOTO_URL_TTL_SECONDS);
  if (error) {
    console.error("[blog] adresses de photos non signées :", error.message);
    return out;
  }
  for (const item of data ?? []) if (item.signedUrl && item.path && !item.error) out.set(item.path, item.signedUrl);
  return out;
}

/** Les articles d'un établissement pour la console, le plus récemment touché d'abord. */
export async function listPostsForConsole(restaurantId: string): Promise<PostRow[]> {
  const { data, error } = await createAdminClient()
    .from("restaurant_posts")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw fail("liste", error);
  return (data ?? []).map(toRow);
}

/** Les articles en ligne, du plus récent au plus ancien (date de première publication). */
export async function listOnlinePosts(restaurantId: string, limit: number): Promise<PostRow[]> {
  const { data, error } = await createAdminClient()
    .from("restaurant_posts")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "en_ligne")
    .order("first_published_at", { ascending: false })
    .limit(limit);
  if (error) throw fail("liste en ligne", error);
  return (data ?? []).map(toRow);
}

export type PostTotals = { reads: number; menuTaps: number };

/** Lectures et appuis sur « Voir la carte » depuis toujours, par article. Lu par pages (PostgREST plafonne à 1 000 lignes). `null` = illisible. */
export async function readPostTotals(postIds: string[]): Promise<Map<string, PostTotals> | null> {
  const out = new Map<string, PostTotals>();
  if (postIds.length === 0) return out;
  const admin = createAdminClient();
  const PAGE = 1000;
  for (let from = 0; from < 100 * PAGE; from += PAGE) {
    const { data, error } = await admin
      .from("restaurant_post_daily")
      .select("post_id, day, reads, menu_taps")
      .in("post_id", postIds)
      .order("post_id", { ascending: true })
      .order("day", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[blog] compteurs illisibles :", error.message);
      return null;
    }
    const rows = (data ?? []) as { post_id: string; reads: number; menu_taps: number }[];
    for (const r of rows) {
      const t = out.get(r.post_id) ?? { reads: 0, menuTaps: 0 };
      out.set(r.post_id, { reads: t.reads + r.reads, menuTaps: t.menuTaps + r.menu_taps });
    }
    if (rows.length < PAGE) return out;
  }
  return out;
}

/** Même porte que la carte : un établissement absent ou non actif n'a pas de page publique. */
export async function restaurantName(restaurantId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from("restaurants").select("name, status").eq("id", restaurantId).maybeSingle();
  if (error) throw new Error(`restaurants : ${error.message}`);
  const r = data as { name: string; status: string } | null;
  return r && r.status === "active" ? r.name : null;
}

/**
 * Suppression de compte (ADR 0111) : l'auteur est détaché de ses articles ; l'article, lui, porte le nom du restaurant
 * et reste. Tables absentes = rien à détacher.
 */
export async function detachPostAuthor(userId: string): Promise<{ message?: string } | null> {
  const { error } = await createAdminClient().from("restaurant_posts").update({ author_id: null }).eq("author_id", userId);
  return error && !isMissingPostTable(error) ? error : null;
}
