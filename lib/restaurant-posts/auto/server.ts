// ADR 0112 — la publication automatique branchée sur le vrai monde : la base, la carte, les sources, l'e-mail et la
// notification. SERVEUR UNIQUEMENT.

import { getAdminAccess } from "../../admin-guard";
import { sendConsolePush } from "../../console-push";
import { sendArticleAutoNotice } from "../../email";
import { articleAutoSubject } from "../../email-templates/pro-article-auto";
import { appLink } from "../../email-templates/kit";
import { getRestaurantContactEmail } from "../../missions-contact";
import { siteOrdersAvailable } from "../../site-orders/access";
import { readPublicMenu } from "../../site-orders/menu-db";
import { createAdminClient } from "../../supabase";
import { supabasePostsDb } from "../db";
import { PostsUnavailableError } from "../service";
import { canWritePosts } from "../states";
import { supabaseAutoDb } from "./db";
import { readOfferings } from "./offerings";
import { sourceCredit } from "./phrases";
import type { AutoDeps, AutoRestaurant, NotifyInput } from "./ports";
import { productionSources } from "./sources";
import { refusalToken } from "./token";
import { weekdayName } from "./time";
import type { Occasion } from "./types";

async function readRestaurant(restaurantId: string): Promise<AutoRestaurant | null> {
  const { data, error } = await createAdminClient().from("restaurants").select("name, status, lat, lng").eq("id", restaurantId).maybeSingle();
  if (error) throw new Error(`restaurants : ${error.message}`);
  const r = data as { name: string; status: string; lat: number | null; lng: number | null } | null;
  if (!r) return null;
  const lat = r.lat === null ? NaN : Number(r.lat);
  const lng = r.lng === null ? NaN : Number(r.lng);
  return {
    id: restaurantId,
    name: r.name,
    coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    open: r.status === "active" && (await siteOrdersAvailable(restaurantId)),
  };
}

/**
 * Prévenir : la personne qui a activé si elle est toujours gérante ou manager, sinon le propriétaire. L'e-mail est
 * journalisé sous `sendId` ; la notification de la console s'ajoute quand elle est activée, elle ne remplace rien.
 */
async function notify({ occasion, content, restaurant, settings, sendId }: NotifyInput): ReturnType<AutoDeps["notify"]> {
  let userId = settings.accepted_by;
  if (userId && !canWritePosts(await getAdminAccess(userId, restaurant.id))) userId = null;
  const to = await getRestaurantContactEmail(restaurant.id, userId);
  if (!to) return { sent: false, reason: "sans_adresse" };

  const menu = await readPublicMenu(restaurant.id);
  const dishId = content.blocks.flatMap((b) => (b.type === "dish" ? [b.itemId] : []))[0];
  const dishName = menu?.categories.flatMap((c) => c.items).find((i) => i.id === dishId)?.name ?? null;
  const postId = occasion.post_id ?? "";
  const accepted = await sendArticleAutoNotice(
    to,
    {
      restaurantName: restaurant.name,
      restaurantId: restaurant.id,
      weekday: weekdayName(occasion.publish_day),
      title: content.title,
      paragraphs: content.blocks.flatMap((b) => (b.type === "p" ? [b.text] : [])),
      dishName,
      credit: sourceCredit(occasion.kind),
      refuseUrl: appLink(`/e/ne-pas-publier/${refusalToken(occasion.id, occasion.publish_at)}`),
      postId,
    },
    { sendId, userId },
  );
  if (!accepted) return { sent: false, reason: "mail_non_parti" };
  // Le journal sait ce que `true` ne dit pas (adresse de test jamais confiée au fournisseur, par exemple).
  const proof = await supabaseAutoDb().sendProof(sendId);
  if (!proof || proof.status === "failed") return { sent: false, reason: "mail_non_parti" };

  if (userId) {
    const push = await sendConsolePush(userId, restaurant.id, {
      title: articleAutoSubject(content.title),
      body: "Tu n'as rien à faire si tu es d'accord.",
      url: `/admin/${restaurant.id}/articles/${postId}/apercu?de=message`,
    }).catch(() => "failed" as const);
    if (push === "failed") console.warn(`[articles auto] notification non partie : restaurant=${restaurant.id}`);
  }
  return { sent: true };
}

export function autoDeps(now: Date = new Date()): AutoDeps {
  return {
    db: supabaseAutoDb(),
    posts: supabasePostsDb(),
    sources: productionSources(),
    now,
    restaurant: readRestaurant,
    menu: async (restaurantId) => {
      try {
        return await readPublicMenu(restaurantId);
      } catch (e) {
        console.error("[articles auto] carte illisible :", (e as Error).message);
        return null;
      }
    },
    offerings: readOfferings,
    notify,
  };
}

/**
 * L'occasion d'un article, pour les gestes du blog écrit à la main qui doivent la suivre. `null` : article ordinaire,
 * ou tables de la publication automatique pas encore créées (le blog à la main marche alors comme avant).
 */
export async function occasionOfPost(restaurantId: string, postId: string): Promise<Occasion | null> {
  try {
    return await supabaseAutoDb().occasionByPost(restaurantId, postId);
  } catch (e) {
    if (e instanceof PostsUnavailableError) return null;
    throw e;
  }
}
