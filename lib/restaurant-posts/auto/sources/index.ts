// ADR 0112 — les sources branchées en production. SERVEUR UNIQUEMENT.

import { readFootballMatches } from "../../../signals/football-source";
import { metForecastReader, readUserAgent } from "../../../signals/weather-met-source";
import { createAdminClient } from "../../../supabase";
import { isMissingOfferSchema, supabaseOffersDb } from "../../../site-offers/db";
import { orderableFor } from "../../../site-offers/service";
import { eventSource, EVENT_SOURCE, type AgendaReader, type AgendaRow } from "./events";
import { matchSource, type MatchReader } from "./matches";
import { promoSource, type PromoReader } from "./promos";
import type { OccasionSource } from "./types";
import { weatherSource } from "./weather";
import { supabaseForecastCache } from "../weather-cache";

const COLUMNS = "source, external_id, event_id, name, category, day, starts_at, ends_at, lat, lng, is_canceled, synced_at";

const agenda: AgendaReader = {
  async nearby({ from, to, box }) {
    const { data, error } = await createAdminClient()
      .from("local_events")
      .select(COLUMNS)
      .eq("source", EVENT_SOURCE)
      .gte("day", from)
      .lte("day", to)
      .gte("lat", box.latMin)
      .lte("lat", box.latMax)
      .gte("lng", box.lngMin)
      .lte("lng", box.lngMax)
      .order("day", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as AgendaRow[];
  },
  async one(source, externalId) {
    const { data, error } = await createAdminClient()
      .from("local_events")
      .select(COLUMNS)
      .eq("source", source)
      .eq("external_id", externalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AgendaRow | null) ?? null;
  },
};

/** Les matchs sont les mêmes pour tous : lus une fois par passage (l'API limite les appels), pas une fois par restaurant. */
function matchesOnce(apiKey: string | undefined): MatchReader {
  const read = new Map<string, ReturnType<MatchReader>>();
  return ({ from, to, competitionIds }) => {
    const key = `${from}|${to}|${competitionIds.join(",")}`;
    let found = read.get(key);
    if (!found) {
      found = readFootballMatches({ apiKey, from, to, competitionIds, maxPages: 2, timeoutMs: 8000 });
      read.set(key, found);
    }
    return found;
  };
}

/** La météo de MET Norway, seulement avec l'identification choisie par la personne qui a accepté leurs conditions. */
function metWeather(env: Record<string, string | undefined>): OccasionSource {
  const agent = readUserAgent(env.MET_NORWAY_USER_AGENT);
  const cache = supabaseForecastCache();
  let ready: Promise<boolean> | null = null;
  return weatherSource({
    reader: agent.ok ? metForecastReader({ userAgent: agent.userAgent, cache }) : null,
    off: agent.ok ? null : agent.why,
    cacheReady: () => (ready ??= cache.ready()),
  });
}

/** Les offres, telles qu'elles sont en base à l'instant. */
function offerReader(): PromoReader {
  const db = supabaseOffersDb();
  return {
    async ready() {
      const admin = createAdminClient();
      const [offers, posts] = await Promise.all([admin.from("site_offers").select("id").limit(1), admin.from("restaurant_posts").select("offer_id").limit(1)]);
      const error = offers.error ?? posts.error;
      if (!error) return null;
      if (isMissingOfferSchema(error)) return "les offres ne sont pas activées (migration 20261127-1400 à appliquer)";
      console.error("[articles auto] offres illisibles :", error.message);
      return "les offres ne se lisent pas";
    },
    published: (restaurantId, sinceDay) => db.published(restaurantId, sinceDay),
    get: (restaurantId, offerId) => db.get(restaurantId, offerId),
    orderable: (restaurantId, offers) => orderableFor(db, restaurantId, offers),
  };
}

/** Un jeu de sources par passage ou par requête : rien n'est gardé au-delà (la réserve météo est en base). */
export function productionSources(env: Record<string, string | undefined> = process.env): OccasionSource[] {
  const apiKey = env.BZZOIRO_API_KEY;
  return [promoSource(offerReader()), eventSource(agenda), matchSource(matchesOnce(apiKey), !!apiKey), metWeather(env)];
}
