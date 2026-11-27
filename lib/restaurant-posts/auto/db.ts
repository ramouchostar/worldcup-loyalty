// ADR 0112 — la base de la publication automatique (service role uniquement : tables sans policy). Tables ou colonnes
// absentes (migration 20261126-2330 pas appliquée) = `PostsUnavailableError` : la console le dit, la tâche planifiée
// aussi, et le blog écrit à la main marche comme avant.

import { createAdminClient } from "../../supabase";
import { isMissingPostTable } from "../db";
import { PostsUnavailableError } from "../service";
import { readBlocks } from "../blocks";
import type { PostRow } from "../types";
import type { AutoDb } from "./ports";
import type { SendProof } from "./proof";
import { isAutoKind, PENDING_STATUSES, type AutoSettings, type Occasion } from "./types";

type DbError = { code?: string; message?: string };

const fail = (what: string, error: DbError): Error =>
  isMissingPostTable(error) ? new PostsUnavailableError() : new Error(`articles automatiques (${what}) : ${error.message}`);

const toSettings = (r: unknown): AutoSettings => {
  const row = r as AutoSettings;
  return { ...row, kinds: (row.kinds ?? []).filter(isAutoKind) };
};

export function supabaseAutoDb(): AutoDb {
  const admin = createAdminClient();
  const settings = () => admin.from("restaurant_post_auto_settings");
  const occasions = () => admin.from("restaurant_post_occasions");

  return {
    async settings(restaurantId) {
      const { data, error } = await settings().select("*").eq("restaurant_id", restaurantId).maybeSingle();
      if (error) throw fail("réglage", error);
      return data ? toSettings(data) : null;
    },
    async enabledSettings() {
      const { data, error } = await settings().select("*").eq("enabled", true).order("restaurant_id", { ascending: true }).limit(1000);
      if (error) throw fail("établissements activés", error);
      return (data ?? []).map(toSettings);
    },
    async saveSettings(row) {
      const { error } = await settings().upsert(row, { onConflict: "restaurant_id" });
      if (error) throw fail("réglage", error);
    },
    async recentOccasions(restaurantId, sinceDay) {
      const { data, error } = await occasions()
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("publish_day", sinceDay)
        .order("publish_day", { ascending: false })
        .limit(500);
      if (error) throw fail("occasions", error);
      return (data ?? []) as Occasion[];
    },
    async occasion(id) {
      const { data, error } = await occasions().select("*").eq("id", id).maybeSingle();
      if (error) throw fail("occasion", error);
      return (data as Occasion | null) ?? null;
    },
    async occasionByPost(restaurantId, postId) {
      const { data, error } = await occasions().select("*").eq("restaurant_id", restaurantId).eq("post_id", postId).maybeSingle();
      if (error) throw fail("occasion d'un article", error);
      return (data as Occasion | null) ?? null;
    },
    async pendingOccasions(restaurantId) {
      let q = occasions().select("*").in("status", [...PENDING_STATUSES]);
      if (restaurantId !== undefined) q = q.eq("restaurant_id", restaurantId);
      const { data, error } = await q.order("publish_day", { ascending: true }).limit(1000);
      if (error) throw fail("occasions en attente", error);
      return (data ?? []) as Occasion[];
    },
    async insertOccasion(row) {
      const { data, error } = await occasions().insert(row).select("*").single();
      if (error) {
        if (error.code === "23505") return null;
        throw fail("création d'occasion", error);
      }
      return data as Occasion;
    },
    async updateOccasion(id, patch, expect) {
      const { data, error } = await occasions().update(patch).eq("id", id).in("status", [...expect]).select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") return null;
        throw fail("écriture d'occasion", error);
      }
      return (data as Occasion | null) ?? null;
    },
    async sendProof(sendId) {
      const { data, error } = await admin.from("message_sends").select("status, delivered_at, bounced_at, complained_at").eq("id", sendId).maybeSingle();
      // Journal illisible : aucune preuve, donc rien ne paraît. Jamais « dans le doute, on publie ».
      if (error) throw fail("journal des messages", error);
      return (data as SendProof | null) ?? null;
    },
    async expiredPosts(nowIso) {
      const { data, error } = await admin
        .from("restaurant_posts")
        .select("*")
        .eq("status", "en_ligne")
        .lte("expires_at", nowIso)
        .order("expires_at", { ascending: true })
        .limit(500);
      if (error) throw fail("articles échus", error);
      return (data ?? []).map((r) => {
        const row = r as PostRow;
        return { ...row, draft_blocks: readBlocks(row.draft_blocks), published_blocks: row.published_blocks === null ? null : readBlocks(row.published_blocks) };
      });
    },
  };
}

/** Suppression de compte : la personne qui répondait des publications n'est plus là, elles s'arrêtent. */
export async function detachAutoAccount(userId: string): Promise<{ message?: string } | null> {
  const admin = createAdminClient();
  const at = new Date().toISOString();
  const stopped = await admin
    .from("restaurant_post_auto_settings")
    .update({ enabled: false, disabled_at: at, updated_at: at })
    .eq("accepted_by", userId)
    .eq("enabled", true);
  if (stopped.error && !isMissingPostTable(stopped.error)) return stopped.error;
  for (const [table, column] of [
    ["restaurant_post_auto_settings", "accepted_by"],
    ["restaurant_post_auto_settings", "disabled_by"],
    ["restaurant_post_occasions", "decided_by"],
  ] as const) {
    const { error } = await admin.from(table).update({ [column]: null }).eq(column, userId);
    if (error && !isMissingPostTable(error)) return error;
  }
  return null;
}
