// ADR 0112 — les sources branchées en production. SERVEUR UNIQUEMENT.

import { readFootballMatches } from "../../../signals/football-source";
import { createAdminClient } from "../../../supabase";
import { eventSource, EVENT_SOURCE, type AgendaReader, type AgendaRow } from "./events";
import { matchSource, type MatchReader } from "./matches";
import { promoSource } from "./promos";
import type { OccasionSource } from "./types";
import { weatherSource } from "./weather";

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

/** Un jeu de sources par passage ou par requête : rien n'est gardé au-delà. */
export function productionSources(env: Record<string, string | undefined> = process.env): OccasionSource[] {
  const apiKey = env.BZZOIRO_API_KEY;
  return [promoSource, eventSource(agenda), matchSource(matchesOnce(apiKey), !!apiKey), weatherSource];
}
