// ADR 0111 §1 — ce que les pages client lisent. Les portes de la commande (drapeau et forfait) sont vérifiées AVANT,
// par la page ou la route. Table absente = aucun article (le bloc disparaît), jamais une erreur pour le client.

import { listOnlinePosts, signPhotoUrls, supabasePostsDb } from "./db";
import { gateByOffer } from "./offer-gate";
import { findOnlinePost, PostsUnavailableError } from "./service";
import { photoPaths, readBlocks } from "./blocks";
import { coverPath, postCard, publicPost, type PostCard, type PublicDish, type PublicPost } from "./view";

const LIST_MAX = 50;
/** Des articles d'offre cachés ne doivent pas prendre la place des autres. */
const OFFER_MARGIN = 10;

/** Les articles en ligne, prêts à montrer (le plus récent d'abord). */
export async function readPostCards(restaurantId: string, limit: number = LIST_MAX): Promise<PostCard[]> {
  try {
    const rows = (await gateByOffer(restaurantId, await listOnlinePosts(restaurantId, limit + OFFER_MARGIN))).slice(0, limit);
    const urls = await signPhotoUrls(rows.flatMap((r) => coverPath(r) ?? []));
    return rows.flatMap((r) => postCard(r, urls) ?? []);
  } catch (e) {
    if (e instanceof PostsUnavailableError) return [];
    throw e;
  }
}

/** Un article en ligne à cette adresse, ou `null`. `dishes` : les plats proposés à la commande aujourd'hui. */
export async function readPublicPost(restaurantId: string, slug: string, dishes: ReadonlyMap<string, PublicDish>): Promise<PublicPost | null> {
  try {
    const row = await findOnlinePost(supabasePostsDb(), restaurantId, slug);
    if (!row || (await gateByOffer(restaurantId, [row])).length === 0) return null;
    const urls = await signPhotoUrls(photoPaths(readBlocks(row.published_blocks)));
    return publicPost(row, urls, dishes);
  } catch (e) {
    if (e instanceof PostsUnavailableError) return null;
    throw e;
  }
}
