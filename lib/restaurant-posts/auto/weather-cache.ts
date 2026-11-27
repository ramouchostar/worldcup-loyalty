// ADR 0112 — la réserve des prévisions météo en base (`weather_forecast_cache`, migration 20261127-0930). Service role
// uniquement. Table absente = la source météo reste éteinte (`ready` faux) : sans réserve, on ne demande rien.

import type { CacheEntry, ForecastCache } from "../../signals/weather-met-source";
import type { MetForecast } from "../../signals/weather-met";
import { createAdminClient } from "../../supabase";

type Row = {
  key: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  last_modified: string | null;
  next_allowed_at: string;
  confirmed_at: string | null;
  forecast: MetForecast | null;
};

const TABLE = "weather_forecast_cache";
const COLUMNS = "key, ok, status, error, last_modified, next_allowed_at, confirmed_at, forecast";

const toEntry = (r: Row): CacheEntry => ({
  key: r.key,
  ok: r.ok,
  status: r.status,
  error: r.error,
  lastModified: r.last_modified,
  nextAllowedAt: r.next_allowed_at,
  confirmedAt: r.confirmed_at,
  forecast: r.forecast && Array.isArray(r.forecast.hours) ? r.forecast : null,
});

export function supabaseForecastCache(): ForecastCache & { ready(): Promise<boolean> } {
  const table = () => createAdminClient().from(TABLE);
  const fail = (what: string, error: { message?: string }) => new Error(`réserve météo (${what}) : ${error.message}`);

  return {
    async ready() {
      const { error } = await table().select("key").limit(1);
      if (error) console.warn("[météo MET Norway] réserve indisponible (migration 20261127-0930 ?) :", error.message);
      return !error;
    },
    async get(key) {
      const { data, error } = await table().select(COLUMNS).eq("key", key).maybeSingle();
      if (error) throw fail("lecture", error);
      return data ? toEntry(data as Row) : null;
    },
    async claim(key, now, until) {
      // Un seul geste par ligne : deux appels en même temps, un seul voit son délai passé.
      const moved = await table()
        .update({ ok: false, next_allowed_at: until, updated_at: now })
        .eq("key", key)
        .lte("next_allowed_at", now)
        .select("key");
      if (moved.error) throw fail("réservation", moved.error);
      if ((moved.data ?? []).length > 0) return true;
      const created = await table().insert({ key, ok: false, next_allowed_at: until, updated_at: now });
      if (!created.error) return true;
      if (created.error.code === "23505") return false;
      throw fail("réservation", created.error);
    },
    async save(e) {
      const { error } = await table().upsert(
        {
          key: e.key,
          ok: e.ok,
          status: e.status,
          error: e.error?.slice(0, 300) ?? null,
          last_modified: e.lastModified?.slice(0, 60) ?? null,
          next_allowed_at: e.nextAllowedAt,
          confirmed_at: e.confirmedAt,
          forecast: e.forecast,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw fail("écriture", error);
    },
  };
}
