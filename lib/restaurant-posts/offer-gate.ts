// ADR 0110, 0112 — un article qui annonce une offre ne se lit que tant que la page peut la tenir : offre publiée, pas finie,
// plat commandable. Une offre arrêtée le cache à l'instant, qu'on ait déjà rangé l'article ou non. SERVEUR UNIQUEMENT.

import { supabaseOffersDb } from "../site-offers/db";
import { articleProblem, type OfferRow } from "../site-offers/offers";
import { orderableFor, type OffersDb } from "../site-offers/service";
import { brusselsDay } from "../site-orders/order";
import type { PostRow } from "./types";

/** La règle, pure : sans offre citée, l'article se lit comme les autres. */
export function readableByOffer<T extends Pick<PostRow, "offer_id">>(rows: T[], offers: readonly OfferRow[], orderable: ReadonlySet<string>, today: string): T[] {
  return rows.filter((r) => !r.offer_id || articleProblem(offers.find((o) => o.id === r.offer_id) ?? null, today, orderable, false) === null);
}

/** Ce que la console dit d'un article d'offre, par identifiant d'article ; rien quand il n'y a rien à signaler. */
export async function offerArticleNotes(restaurantId: string, rows: Pick<PostRow, "id" | "offer_id" | "status">[], now: Date = new Date(), db?: OffersDb): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const cited = rows.filter((r) => !!r.offer_id && (r.status === "en_ligne" || r.status === "retire"));
  if (cited.length === 0) return out;
  try {
    const offersDb = db ?? supabaseOffersDb();
    const offers = await offersDb.byIds(restaurantId, [...new Set(cited.map((r) => r.offer_id!))]);
    const orderable = await orderableFor(offersDb, restaurantId, offers);
    for (const r of cited) {
      const offer = offers.find((o) => o.id === r.offer_id);
      if (r.status === "en_ligne" && readableByOffer([r], offers, orderable, brusselsDay(now)).length === 0) {
        out.set(r.id, "Tes clients ne le voient pas : l'offre qu'il annonce n'est plus affichée sur ta page.");
      } else if (r.status === "retire" && offer?.state === "arretee") {
        out.set(r.id, "Retiré : l'offre qu'il annonçait est arrêtée.");
      }
    }
  } catch (e) {
    console.error(`[blog] offres illisibles pour la console : restaurant=${restaurantId}`, (e as Error).message);
  }
  return out;
}

/** Les lignes que des clients peuvent lire. Offres illisibles : les articles d'offre sont cachés (jamais une offre arrêtée annoncée). */
export async function gateByOffer<T extends Pick<PostRow, "offer_id">>(restaurantId: string, rows: T[], now: Date = new Date(), db?: OffersDb): Promise<T[]> {
  const ids = [...new Set(rows.flatMap((r) => r.offer_id ?? []))];
  if (ids.length === 0) return rows;
  try {
    const offersDb = db ?? supabaseOffersDb();
    const offers = await offersDb.byIds(restaurantId, ids);
    return readableByOffer(rows, offers, await orderableFor(offersDb, restaurantId, offers), brusselsDay(now));
  } catch (e) {
    console.error(`[blog] offres illisibles, articles d'offre cachés : restaurant=${restaurantId}`, (e as Error).message);
    return rows.filter((r) => !r.offer_id);
  }
}
