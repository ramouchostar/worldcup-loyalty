// ADR 0112 — la source des promos : les offres publiées de la page de commande (ADR 0110). Une offre donne UNE occasion,
// publiable un jour où elle vaut ; la fin de l'article est la fin de l'offre. La revérification redit tout : offre toujours
// publiée, valable ce jour (et aujourd'hui pour « Publier maintenant »), même titre et mêmes dates, plat lié commandable.

import { articleProblem, coversDay, lastValidDay, validDays, type OfferRow } from "../../../site-offers/offers";
import { brusselsDay, endOfDay } from "../time";
import type { Candidate, PromoFacts } from "../types";
import type { OccasionSource } from "./types";

export type PromoReader = {
  /** Pourquoi les offres ne peuvent rien donner (tables absentes), ou `null`. */
  ready(): Promise<string | null>;
  /** Les offres publiées dont le dernier jour est `sinceDay` ou après. */
  published(restaurantId: string, sinceDay: string): Promise<OfferRow[]>;
  get(restaurantId: string, offerId: string): Promise<OfferRow | null>;
  /** Les plats commandables parmi ceux que ces offres citent. */
  orderable(restaurantId: string, offers: OfferRow[]): Promise<Set<string>>;
};

export const promoKey = (offerId: string): string => `promo:${offerId}`;

export const promoFacts = (o: OfferRow, day: string): PromoFacts => ({
  kind: "promo",
  offerId: o.id,
  label: o.title,
  day,
  startsDay: o.first_day,
  endsDay: o.last_day,
  weekdays: o.weekdays,
  itemId: o.menu_item_id,
  hasConditions: o.conditions !== null,
});

const sameDays = (a: number[] | null, b: number[] | null) => (a ?? []).join(",") === (b ?? []).join(",");

export function promoSource(reader: PromoReader): OccasionSource {
  return {
    kind: "promo",
    unavailable: () => reader.ready(),

    async read(ctx, window) {
      try {
        const offers = (await reader.published(ctx.restaurantId, window.from)).filter((o) => o.state === "publiee");
        const orderable = await reader.orderable(ctx.restaurantId, offers);
        const candidates: Candidate[] = [];
        for (const o of offers) {
          // Un plat masqué : la page ne montre pas l'offre, aucun article ne l'annonce.
          if (articleProblem(o, window.from, orderable, false) !== null) continue;
          const days = validDays(o, window.from, window.to);
          if (days.length === 0) continue;
          const last = lastValidDay(o);
          candidates.push({
            kind: "promo",
            sourceKey: promoKey(o.id),
            // Celle qui finit le plus tôt passe devant, comme sur la page.
            rank: Number(last.replaceAll("-", "")),
            later: last > window.to,
            days: days.map((day) => ({ day, expiresAt: endOfDay(last), facts: promoFacts(o, day) })),
          });
        }
        return { ok: true, candidates };
      } catch (e) {
        return { ok: false, error: `offres : ${(e as Error).message}` };
      }
    },

    async recheck(ctx, facts) {
      if (facts.kind !== "promo") return { ok: false, reason: "promo_finie" };
      try {
        const offer = await reader.get(ctx.restaurantId, facts.offerId);
        const today = brusselsDay(ctx.now);
        const orderable = offer ? await reader.orderable(ctx.restaurantId, [offer]) : new Set<string>();
        const problem = articleProblem(offer, today, orderable, false);
        if (problem !== null || !offer) return { ok: false, reason: problem ?? "promo_finie" };
        if (offer.title !== facts.label || offer.first_day !== facts.startsDay || offer.last_day !== facts.endsDay || offer.menu_item_id !== facts.itemId || !sameDays(offer.weekdays, facts.weekdays)) {
          return { ok: false, reason: "promo_changee" };
        }
        if (!coversDay(offer, facts.day)) return { ok: false, reason: "promo_finie" };
        // « Publier maintenant » : une personne publie à l'instant, l'offre doit valoir aujourd'hui.
        if (ctx.publishing === "maintenant" && !coversDay(offer, today)) return { ok: false, reason: "promo_pas_aujourdhui" };
        return { ok: true };
      } catch (e) {
        console.error(`[articles auto] offre illisible : restaurant=${ctx.restaurantId}`, (e as Error).message);
        return { ok: false, reason: "source_indisponible" };
      }
    },
  };
}
