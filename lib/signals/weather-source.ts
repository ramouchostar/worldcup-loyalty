// ============================================================
// Signal « météo » — archive Open-Meteo (réseau uniquement, aucune écriture
// en base). Les règles vivent dans weather.ts.
//
// RÔLE LIMITÉ : amorcer le calage de l'effet météo sur les tickets PASSÉS
// (« chez vous, la pluie fait +22 % »). Les prévisions viennent de Google
// Weather (weather-google-source.ts, décidé le 2026-10-06), qui ne sert que
// 24 h d'historique.
//
// SERVEUR UNIQUEMENT. Aucune clé. JSON lu avec `fetch`, sans le SDK
// `openmeteo` (colonnes lues par position, heure locale recalculée à la main).
//
// MODÈLE (vérifié le 2026-10-06 sur Kraainem) : archive SANS modèle imposé —
// complète jusqu'à la veille. `era5_land` renvoie la pluie entièrement vide ;
// `era5` a ~5 jours de retard.
//
// LICENCE : l'offre gratuite exclut l'usage commercial — action du backlog
// « Météo : licence commerciale Open-Meteo », à régler avant tout usage
// au-delà du calage interne.
// ============================================================

import { countMissingHours, parseOpenMeteoHourly, validCoordinates, type Coordinates, type WeatherRead } from "./weather";
import { USER_AGENT } from "./transport-source";

export const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
export const TIMEZONE = "Europe/Brussels";
/** Le modèle part avec chaque lecture : un effet mesuré se rattache à sa source. */
export const ARCHIVE_MODEL = "open_meteo_best_match";

const ARCHIVE_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "snowfall",
  "wind_speed_10m",
  "weather_code",
] as const;

const DEFAULT_TIMEOUT_MS = 20_000;

/** `from`/`to` : AAAA-MM-JJ, bornes incluses. */
export function archiveUrl(c: Coordinates, from: string, to: string): string {
  const q = new URLSearchParams({
    // 4 décimales ≈ 10 m : bien plus fin que la maille des modèles (≥ 1 km).
    latitude: c.latitude.toFixed(4),
    longitude: c.longitude.toFixed(4),
    timezone: TIMEZONE,
    start_date: from,
    end_date: to,
    hourly: ARCHIVE_VARIABLES.join(","),
  });
  return `${ARCHIVE_URL}?${q}`;
}

export type ArchiveFetch =
  | { ok: true; model: string; read: WeatherRead; missingHours: number; raw: unknown }
  | { ok: false; model: string; error: string };

export type ArchiveFetchOptions = { fetchImpl?: typeof fetch; timeoutMs?: number };

export function describeHttpError(status: number, reason: string | null): string {
  if (status === 429) return "limite d'appels Open-Meteo atteinte (429) : garder le résultat en cache";
  return reason ? `Open-Meteo a répondu ${status} : ${reason}` : `Open-Meteo a répondu ${status}`;
}

export async function readArchive(
  c: Coordinates,
  from: string,
  to: string,
  o: ArchiveFetchOptions = {}
): Promise<ArchiveFetch> {
  const model = ARCHIVE_MODEL;
  const fail = (error: string): ArchiveFetch => ({ ok: false, model, error });
  if (!validCoordinates(c)) return fail("coordonnées invalides");

  let res: Response;
  try {
    res = await (o.fetchImpl ?? fetch)(archiveUrl(c, from, to), {
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
  return { ok: true, model, read: parsed, missingHours: countMissingHours(parsed), raw: body };
}
