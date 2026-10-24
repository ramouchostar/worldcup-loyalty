import { createAdminClient } from "./supabase";
import { belgianPublicHolidays } from "./forecast";
import { addDays } from "./daily-revenue-model";
import { readGoogleHistory } from "./signals/weather-google-source";
import { summarizeServices, type ServiceWeather } from "./signals/weather";
import { readFootballMatches } from "./signals/football-source";
import { FOOTBALL_COMPETITIONS } from "./signals/football";
import { distanceKm } from "./signals/local-events";
import { dayReasons, type DayEvent, type DayReasons } from "./day-reasons";

// ADR 0087 §3 — lecture des faits d'un jour au CA inhabituel. SERVEUR UNIQUEMENT.
// Chaque source est fail-open : une panne retire ses faits et l'ajoute à
// `unknown`, jamais une page cassée ni un « rien de particulier » mensonger.

type Place = { id: string; lat: number | null; lng: number | null };

/** Les compétitions lues pour un jour passé : celles que relevantMatches garde (moins d'appels). */
const READ_COMPETITIONS = FOOTBALL_COMPETITIONS.filter((c) => c.id === 14 || c.group === "europe" || c.group === "selections").map((c) => c.id);
const EVENTS_RADIUS_KM = 5;

/**
 * Photo de la météo du jour (Google, 24 dernières heures), à prendre le soir même
 * après le service : au-delà, Google ne la sert plus. Renvoie les services gardés.
 */
export async function snapshotDayWeather(place: Place, day: string): Promise<ServiceWeather[] | null> {
  if (place.lat === null || place.lng === null) return null;
  const read = await readGoogleHistory({ latitude: place.lat, longitude: place.lng });
  if (!read.ok) {
    console.error(`[meteo-du-jour] ${place.id} ${day} : ${read.error}`);
    return null;
  }
  const services = summarizeServices(read.read).filter((s) => s.date === day && s.missingHours === 0);
  if (services.length === 0) return null;
  const { error } = await createAdminClient()
    .from("restaurant_day_weather")
    .upsert({ restaurant_id: place.id, day, services, fetched_at: new Date().toISOString() }, { onConflict: "restaurant_id,day" });
  if (error) console.error(`[meteo-du-jour] ${place.id} ${day} non gardée :`, error.message);
  return services;
}

export async function hasDayWeather(restaurantId: string, day: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("restaurant_day_weather").select("day").eq("restaurant_id", restaurantId).eq("day", day).maybeSingle();
  return !error && !!data;
}

async function dayWeather(place: Place, day: string, today: string): Promise<ServiceWeather[] | null> {
  const { data, error } = await createAdminClient().from("restaurant_day_weather").select("services").eq("restaurant_id", place.id).eq("day", day).maybeSingle();
  if (!error && data) return (data as { services: ServiceWeather[] }).services;
  // Pas de photo : aujourd'hui ou hier, Google la sert encore (en partie pour hier).
  if (day >= addDays(today, -1)) return snapshotDayWeather(place, day).catch(() => null);
  return null;
}

async function dayEvents(place: Place, day: string): Promise<DayEvent[] | null> {
  if (place.lat === null || place.lng === null) return [];
  const { data, error } = await createAdminClient()
    .from("local_events")
    .select("name, lat, lng, is_high_capacity, is_canceled")
    .eq("day", day)
    .eq("is_canceled", false);
  if (error) return null;
  const here = { lat: place.lat, lng: place.lng };
  return ((data ?? []) as { name: string; lat: number | null; lng: number | null; is_high_capacity: boolean }[])
    .filter((e) => e.lat !== null && e.lng !== null)
    .map((e) => ({ name: e.name, highCapacity: e.is_high_capacity, distanceKm: Math.round(distanceKm(here, { lat: e.lat as number, lng: e.lng as number }) * 10) / 10 }))
    .filter((e) => e.distanceKm <= EVENTS_RADIUS_KM);
}

async function schoolHoliday(day: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("reference_calendar")
    .select("label, community")
    .eq("kind", "school_holiday")
    .lte("starts_on", day)
    .gte("ends_on", day);
  if (error || !data?.length) return null;
  // Bruxelles : les vacances francophones d'abord, puis néerlandophones.
  const rows = data as { label: string; community: string | null }[];
  return (rows.find((r) => r.community === "FR") ?? rows.find((r) => r.community === "NL") ?? rows[0]).label;
}

export async function loadDayReasons(place: Place, day: string, today: string): Promise<DayReasons> {
  const [weather, football, events, school] = await Promise.all([
    dayWeather(place, day, today).catch(() => null),
    readFootballMatches({ apiKey: process.env.BZZOIRO_API_KEY, from: day, to: day, competitionIds: READ_COMPETITIONS, maxPages: 1, timeoutMs: 6000 }).catch(() => null),
    dayEvents(place, day).catch(() => null),
    schoolHoliday(day).catch(() => null),
  ]);
  const reasons = dayReasons({
    day,
    weather: weather ?? [],
    matches: football?.matches ?? [],
    events: events ?? [],
    publicHoliday: belgianPublicHolidays(Number(day.slice(0, 4))).get(day) ?? null,
    schoolHoliday: school,
  });
  // Une source muette ne vaut pas « rien ce jour-là » : on le dit.
  if (!football || (!football.ok && football.matches.length === 0)) reasons.unknown.push("matchs");
  if (events === null) reasons.unknown.push("événements");
  return reasons;
}
