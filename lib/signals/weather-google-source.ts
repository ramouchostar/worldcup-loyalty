// ============================================================
// Signal « météo » — lecture de Google Weather (réseau uniquement, aucune
// écriture en base). Les règles vivent dans weather.ts.
//
// SERVEUR UNIQUEMENT. Clé GOOGLE_PLACES_API_KEY (la même clé Google Maps
// Platform que l'audit, ADR 0071 ; l'API Weather y est activée) envoyée en
// EN-TÊTE X-Goog-Api-Key : elle n'apparaît jamais dans une URL, un journal ou
// un message d'erreur.
//
// LIMITES (lues le 2026-10-06) :
//   prévisions : 24 heures PAR PAGE au plus → 7 jours = 7 appels FACTURÉS.
//                L'appelant garde le résultat en cache (une lecture par
//                établissement, une ou deux fois par jour), jamais à chaque
//                message.
//   historique : les 24 DERNIÈRES heures seulement. Pour se constituer une
//                archive, il faut lire chaque jour ; le passé plus ancien
//                vient de l'archive Open-Meteo (weather-source.ts).
//
// Aucune lecture n'échoue en silence : le résultat dit le nombre de pages,
// les heures manquantes, ou la cause exacte de l'échec.
// ============================================================

import { countMissingHours, parseGoogleWeatherHours, validCoordinates, type Coordinates, type WeatherRead } from "./weather";

export const GOOGLE_WEATHER_URL = "https://weather.googleapis.com/v1";
export const GOOGLE_WEATHER_MODEL = "google_weather";
const PAGE_SIZE = 24; // maximum servi par Google
const MAX_PAGES = 10; // 240 h, le maximum de l'API : garde-fou contre une boucle de pagination
const DEFAULT_TIMEOUT_MS = 20_000;

export type GoogleWeatherFetch =
  | {
      ok: true;
      kind: "forecast" | "history";
      model: string;
      read: WeatherRead;
      pages: number;
      missingHours: number;
      raw: unknown[];
    }
  | { ok: false; kind: "forecast" | "history"; model: string; error: string; pages: number };

export type GoogleWeatherOptions = { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number };

export function googleWeatherUrl(
  kind: "forecast" | "history",
  c: Coordinates,
  hours: number,
  pageToken?: string
): string {
  const q = new URLSearchParams({
    "location.latitude": c.latitude.toFixed(4),
    "location.longitude": c.longitude.toFixed(4),
    hours: String(hours),
    pageSize: String(Math.min(PAGE_SIZE, hours)),
  });
  if (pageToken) q.set("pageToken", pageToken);
  return `${GOOGLE_WEATHER_URL}/${kind}/hours:lookup?${q}`;
}

export function describeGoogleError(status: number, message: string | null): string {
  if (status === 429) return "quota Google Weather atteint (429) : garder le résultat en cache";
  if (status === 403) return `accès refusé (403) : API Weather non activée ou clé restreinte${message ? ` — ${message}` : ""}`;
  return message ? `Google Weather a répondu ${status} : ${message}` : `Google Weather a répondu ${status}`;
}

async function readPages(
  kind: "forecast" | "history",
  c: Coordinates,
  hours: number,
  o: GoogleWeatherOptions
): Promise<GoogleWeatherFetch> {
  const model = GOOGLE_WEATHER_MODEL;
  const pages: unknown[] = [];
  const fail = (error: string): GoogleWeatherFetch => ({ ok: false, kind, model, error, pages: pages.length });

  if (!validCoordinates(c)) return fail("coordonnées invalides");
  const apiKey = o.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return fail("clé GOOGLE_PLACES_API_KEY absente");

  let token: string | undefined;
  do {
    let res: Response;
    try {
      res = await (o.fetchImpl ?? fetch)(googleWeatherUrl(kind, c, hours, token), {
        headers: { "X-Goog-Api-Key": apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(o.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (e) {
      return fail(`réseau : ${(e as Error).message || "échec"}`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return fail(res.ok ? "réponse illisible (JSON invalide)" : describeGoogleError(res.status, null));
    }
    if (!res.ok) {
      const msg = (body as { error?: { message?: unknown } } | null)?.error?.message;
      return fail(describeGoogleError(res.status, typeof msg === "string" ? msg : null));
    }
    pages.push(body);
    const next = (body as { nextPageToken?: unknown } | null)?.nextPageToken;
    token = typeof next === "string" && next ? next : undefined;
  } while (token && pages.length < MAX_PAGES);

  const read = parseGoogleWeatherHours(pages, c);
  if (!read) return fail("format de réponse inattendu");
  if (read.hours.length === 0) return fail("réponse sans aucune heure");
  return { ok: true, kind, model, read, pages: pages.length, missingHours: countMissingHours(read), raw: pages };
}

/** Prévisions horaires, `days` jours (7 par défaut, 10 au plus). */
export function readGoogleForecast(c: Coordinates, opts: GoogleWeatherOptions & { days?: number } = {}) {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 10);
  return readPages("forecast", c, days * 24, opts);
}

/** Les 24 dernières heures (le maximum servi par Google). */
export function readGoogleHistory(c: Coordinates, opts: GoogleWeatherOptions = {}) {
  return readPages("history", c, 24, opts);
}
