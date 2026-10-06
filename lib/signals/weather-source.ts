// ============================================================
// Signal « météo » — lecture d'Open-Meteo (réseau uniquement, aucune écriture
// en base). Les règles vivent dans weather.ts.
//
// SERVEUR UNIQUEMENT. Aucune clé. JSON lu avec `fetch`, sans le SDK
// `openmeteo` : il lit les colonnes par POSITION (une variable ajoutée au
// mauvais rang fait passer la pluie pour la température, sans erreur) et
// recalcule l'heure locale à la main. Ici les colonnes sont nommées et
// `timezone=Europe/Brussels` renvoie directement l'heure locale.
//
// MODÈLES (vérifiés le 2026-10-06 sur Kraainem) :
//   prévisions : `best_match` (par défaut) — les modèles fins (ICON-D2, KNMI,
//                AROME) sur les premiers jours, puis ICON-EU / ECMWF.
//   historique : archive SANS modèle imposé — complète jusqu'à la veille.
//                `era5_land` renvoie la pluie entièrement vide ; `era5` a
//                ~5 jours de retard ; `past_days` laisse des heures vides.
//
// LICENCE : l'offre gratuite exclut l'usage commercial. Suffisant pour
// construire et tester ; la licence commerciale est une action séparée du
// backlog (« Météo : licence commerciale Open-Meteo »), à régler avant le
// premier pilote payant.
//
// Aucune lecture n'échoue en silence : le résultat dit ce qui a été lu, quel
// modèle, et combien d'heures manquent.
// ============================================================

import { parseOpenMeteoHourly, type WeatherRead } from "./weather";
import { USER_AGENT } from "./transport-source";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
export const TIMEZONE = "Europe/Brussels";

/** Le modèle part avec chaque lecture : un effet mesuré se rattache à sa source. */
export const FORECAST_MODEL = "best_match";
export const ARCHIVE_MODEL = "best_match";

const FORECAST_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "precipitation_probability",
  "snowfall",
  "wind_speed_10m",
  "weather_code",
] as const;
// L'archive ne sert pas de probabilité : c'est ce qui est tombé.
const ARCHIVE_VARIABLES = FORECAST_VARIABLES.filter((v) => v !== "precipitation_probability");

const DEFAULT_TIMEOUT_MS = 20_000;

export type Coordinates = { latitude: number; longitude: number };

export function validCoordinates(c: Coordinates): boolean {
  return (
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
  );
}

function coords(c: Coordinates): Record<string, string> {
  // 4 décimales ≈ 10 m : bien plus fin que la maille des modèles (≥ 1 km).
  return { latitude: c.latitude.toFixed(4), longitude: c.longitude.toFixed(4) };
}

export function forecastUrl(c: Coordinates, days = 7): string {
  const q = new URLSearchParams({
    ...coords(c),
    timezone: TIMEZONE,
    forecast_days: String(days),
    models: FORECAST_MODEL,
    hourly: FORECAST_VARIABLES.join(","),
  });
  return `${FORECAST_URL}?${q}`;
}

/** `from`/`to` : AAAA-MM-JJ, bornes incluses. */
export function archiveUrl(c: Coordinates, from: string, to: string): string {
  const q = new URLSearchParams({
    ...coords(c),
    timezone: TIMEZONE,
    start_date: from,
    end_date: to,
    hourly: ARCHIVE_VARIABLES.join(","),
  });
  return `${ARCHIVE_URL}?${q}`;
}

export type WeatherFetch =
  | { ok: true; kind: "forecast" | "archive"; model: string; read: WeatherRead; missingHours: number; raw: unknown }
  | { ok: false; kind: "forecast" | "archive"; model: string; error: string };

export type WeatherFetchOptions = { fetchImpl?: typeof fetch; timeoutMs?: number };

export function describeHttpError(status: number, reason: string | null): string {
  if (status === 429) return "limite d'appels Open-Meteo atteinte (429) : garder le résultat en cache";
  return reason ? `Open-Meteo a répondu ${status} : ${reason}` : `Open-Meteo a répondu ${status}`;
}

/** Heures où l'une des variables utiles est absente (`null`). */
export function countMissingHours(read: WeatherRead): number {
  return read.hours.filter(
    (h) => h.apparentTemperature === null || h.precipitation === null || h.windSpeed === null || h.weatherCode === null
  ).length;
}

async function read(
  kind: "forecast" | "archive",
  model: string,
  url: string,
  o: WeatherFetchOptions
): Promise<WeatherFetch> {
  const fail = (error: string): WeatherFetch => ({ ok: false, kind, model, error });
  let res: Response;
  try {
    res = await (o.fetchImpl ?? fetch)(url, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(o.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    return fail(`réseau : ${(e as Error).message || "échec"}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return fail(res.ok ? "réponse illisible (JSON invalide)" : describeHttpError(res.status, null));
  }
  // Open-Meteo dit pourquoi il refuse : { error: true, reason: "Latitude must be…" }.
  const reason =
    body && typeof body === "object" && typeof (body as { reason?: unknown }).reason === "string"
      ? (body as { reason: string }).reason
      : null;
  if (!res.ok || (body as { error?: unknown } | null)?.error === true) {
    return fail(describeHttpError(res.status, reason));
  }

  const parsed = parseOpenMeteoHourly(body);
  if (!parsed) return fail("format de réponse inattendu");
  if (parsed.hours.length === 0) return fail("réponse sans aucune heure");
  return { ok: true, kind, model, read: parsed, missingHours: countMissingHours(parsed), raw: body };
}

export async function readForecast(c: Coordinates, opts: WeatherFetchOptions & { days?: number } = {}) {
  if (!validCoordinates(c)) return { ok: false, kind: "forecast", model: FORECAST_MODEL, error: "coordonnées invalides" } as WeatherFetch;
  return read("forecast", FORECAST_MODEL, forecastUrl(c, opts.days), opts);
}

export async function readArchive(c: Coordinates, from: string, to: string, opts: WeatherFetchOptions = {}) {
  if (!validCoordinates(c)) return { ok: false, kind: "archive", model: ARCHIVE_MODEL, error: "coordonnées invalides" } as WeatherFetch;
  return read("archive", ARCHIVE_MODEL, archiveUrl(c, from, to), opts);
}
