// ADR 0111 §3 — la porte des écrans « articles » de la console : voir (gérant, manager, plateforme en lecture), écrire
// (gérant, manager), et l'espace de commande ouvert (drapeau ET forfait, comme la commande : sinon 404). Serveur
// uniquement : le layout de la console ne remplace pas ce contrôle.

import { notFound, redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/admin-guard";
import { listPostsForConsole, readPostTotals, signPhotoUrls, supabasePostsDb } from "@/lib/restaurant-posts/db";
import { PostsUnavailableError } from "@/lib/restaurant-posts/service";
import { canSeePosts, canWritePosts, hasPendingChanges, isExpired } from "@/lib/restaurant-posts/states";
import { photoPaths } from "@/lib/restaurant-posts/blocks";
import type { PostRow } from "@/lib/restaurant-posts/types";
import { dayLabel } from "@/lib/restaurant-posts/view";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { readPublicMenu } from "@/lib/site-orders/menu-db";
import type { PublicMenu } from "@/lib/site-orders/menu";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase";
import type { PostListItem } from "@/components/admin/articles/PostsList";
import { supabaseAutoDb } from "@/lib/restaurant-posts/auto/db";
import { isActive } from "@/lib/restaurant-posts/auto/engine";
import { missedItems, publishedNote, upcomingItems, type MissedItem, type UpcomingItem } from "@/lib/restaurant-posts/auto/overview";
import { addDays, brusselsDay } from "@/lib/restaurant-posts/auto/time";
import type { AutoSettings, Occasion } from "@/lib/restaurant-posts/auto/types";

export async function openConsole(restaurantId: string): Promise<{ canSee: boolean; canWrite: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  if (!(await siteOrdersAvailable(restaurantId))) notFound();
  return { canSee: canSeePosts(access), canWrite: canWritePosts(access) };
}

const toItem = (row: PostRow, totals: Map<string, { reads: number; menuTaps: number }> | null, occasion: Occasion | undefined, now: Date): PostListItem => {
  // Un article échu n'est plus lu par personne, même avant que la tâche planifiée l'ait rangé.
  const ended = row.status === "en_ligne" && isExpired(row, now);
  const status = ended ? "retire" : row.status;
  const auto = occasion?.status === "publie" && (status === "en_ligne" || status === "retire");
  const endedAlone = status === "retire" && !!row.expires_at && !!row.withdrawn_at && row.withdrawn_at >= row.expires_at;
  return {
    id: row.id,
    status,
    title: (row.status === "en_ligne" ? row.published_title : row.draft_title) ?? row.draft_title,
    slug: row.slug,
    publishedLabel: row.first_published_at ? dayLabel(row.first_published_at) : null,
    updatedLabel: dayLabel(row.updated_at),
    withdrawnLabel: row.withdrawn_at ? dayLabel(row.withdrawn_at) : null,
    totals: totals ? totals.get(row.id) ?? { reads: 0, menuTaps: 0 } : null,
    pending: !ended && hasPendingChanges(row),
    maskReason: row.mask_reason,
    note: status === "en_ligne" && auto ? publishedNote(occasion, now) : ended || endedAlone ? "Retiré tout seul à la fin de l'occasion. Tes clients ne le voient plus." : null,
  };
};

export type ConsoleList = { state: "ok"; posts: PostListItem[] } | { state: "unavailable" } | { state: "failed" };

export type ConsoleAuto = {
  /** `off` : les tables manquent ou ne se lisent pas, la page reste celle du blog écrit à la main. */
  state: "ok" | "off" | "failed";
  settings: AutoSettings | null;
  active: boolean;
  upcoming: UpcomingItem[];
  missed: MissedItem[];
  occasions: Occasion[];
};

const NO_AUTO: ConsoleAuto = { state: "off", settings: null, active: false, upcoming: [], missed: [], occasions: [] };

/** La publication automatique d'un établissement, pour la console (ADR 0112). */
export async function loadAuto(restaurantId: string, now: Date = new Date()): Promise<ConsoleAuto> {
  try {
    const db = supabaseAutoDb();
    const [settings, occasions] = await Promise.all([db.settings(restaurantId), db.recentOccasions(restaurantId, addDays(brusselsDay(now), -90))]);
    return {
      state: "ok",
      settings,
      active: isActive(settings),
      upcoming: upcomingItems(occasions, now),
      missed: missedItems(occasions, now),
      occasions,
    };
  } catch (e) {
    if (e instanceof PostsUnavailableError) return NO_AUTO;
    console.error("[articles auto] console :", e);
    return { ...NO_AUTO, state: "failed" };
  }
}

export async function loadList(restaurantId: string, occasions: Occasion[] = [], now: Date = new Date()): Promise<ConsoleList> {
  try {
    const rows = await listPostsForConsole(restaurantId);
    const totals = await readPostTotals(rows.map((r) => r.id));
    const byPost = new Map(occasions.flatMap((o) => (o.post_id ? [[o.post_id, o] as const] : [])));
    // Un article qui attend sa publication automatique est montré dans « Bientôt publiés », pas parmi les brouillons.
    const shown = rows.filter((r) => !(r.status === "brouillon" && byPost.get(r.id)?.status === "prevenu"));
    return { state: "ok", posts: shown.map((r) => toItem(r, totals, byPost.get(r.id), now)) };
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

/** La position du restaurant est-elle connue ? (les événements « près de chez toi » en dépendent). */
export async function restaurantHasPosition(restaurantId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("restaurants").select("lat, lng").eq("id", restaurantId).maybeSingle();
  if (error) {
    console.error("[articles auto] position illisible :", error.message);
    return false;
  }
  const r = data as { lat: number | null; lng: number | null } | null;
  return !!r && r.lat !== null && r.lng !== null;
}
