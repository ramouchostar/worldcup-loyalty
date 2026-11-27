// ADR 0111 §3 — la porte des écrans « articles » de la console : voir (gérant, manager, plateforme en lecture), écrire
// (gérant, manager), et l'espace de commande ouvert (drapeau ET forfait, comme la commande : sinon 404). Serveur
// uniquement : le layout de la console ne remplace pas ce contrôle.

import { notFound, redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/admin-guard";
import { listPostsForConsole, readPostTotals, signPhotoUrls, supabasePostsDb } from "@/lib/restaurant-posts/db";
import { PostsUnavailableError } from "@/lib/restaurant-posts/service";
import { canSeePosts, canWritePosts, hasPendingChanges } from "@/lib/restaurant-posts/states";
import { photoPaths } from "@/lib/restaurant-posts/blocks";
import type { PostRow } from "@/lib/restaurant-posts/types";
import { dayLabel } from "@/lib/restaurant-posts/view";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { readPublicMenu } from "@/lib/site-orders/menu-db";
import type { PublicMenu } from "@/lib/site-orders/menu";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { PostListItem } from "@/components/admin/articles/PostsList";

export async function openConsole(restaurantId: string): Promise<{ canSee: boolean; canWrite: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  if (!(await siteOrdersAvailable(restaurantId))) notFound();
  return { canSee: canSeePosts(access), canWrite: canWritePosts(access) };
}

const toItem = (row: PostRow, totals: Map<string, { reads: number; menuTaps: number }> | null): PostListItem => ({
  id: row.id,
  status: row.status,
  title: (row.status === "en_ligne" ? row.published_title : row.draft_title) ?? row.draft_title,
  slug: row.slug,
  publishedLabel: row.first_published_at ? dayLabel(row.first_published_at) : null,
  updatedLabel: dayLabel(row.updated_at),
  withdrawnLabel: row.withdrawn_at ? dayLabel(row.withdrawn_at) : null,
  totals: totals ? totals.get(row.id) ?? { reads: 0, menuTaps: 0 } : null,
  pending: hasPendingChanges(row),
  maskReason: row.mask_reason,
});

export type ConsoleList = { state: "ok"; posts: PostListItem[] } | { state: "unavailable" } | { state: "failed" };

export async function loadList(restaurantId: string): Promise<ConsoleList> {
  try {
    const rows = await listPostsForConsole(restaurantId);
    const totals = await readPostTotals(rows.map((r) => r.id));
    return { state: "ok", posts: rows.map((r) => toItem(r, totals)) };
  } catch (e) {
    if (e instanceof PostsUnavailableError) return { state: "unavailable" };
    console.error("[blog] liste console :", e);
    return { state: "failed" };
  }
}

export type LoadedPost = { state: "ok"; post: PostRow; photoUrls: Map<string, string> } | { state: "unavailable" };

/** L'article et les adresses de ses photos de brouillon. Article d'un autre établissement ou inconnu : 404. */
export async function loadPost(restaurantId: string, postId: string): Promise<LoadedPost> {
  try {
    const post = await supabasePostsDb().get(restaurantId, postId);
    if (!post) notFound();
    return { state: "ok", post, photoUrls: await signPhotoUrls(photoPaths(post.draft_blocks)) };
  } catch (e) {
    if (e instanceof PostsUnavailableError) return { state: "unavailable" };
    throw e;
  }
}

/** Les tables existent-elles ? (avant d'ouvrir un éditeur dont l'enregistrement échouerait). */
export async function postsReady(restaurantId: string): Promise<boolean> {
  return (await loadList(restaurantId)).state !== "unavailable";
}

export async function menuForConsole(restaurantId: string): Promise<PublicMenu | null> {
  try {
    return await readPublicMenu(restaurantId);
  } catch (e) {
    console.error("[blog] carte illisible :", (e as Error).message);
    return null;
  }
}

export const dishOptions = (menu: PublicMenu | null) =>
  (menu?.categories ?? []).flatMap((c) => c.items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, category: c.name })));
