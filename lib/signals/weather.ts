// ============================================================
// Signal « météo » — prévisions et historique Open-Meteo (backlog plateforme,
// décidé le 2026-10-01 ; ADR 0074 §8).
//
// Module PUR : aucun réseau, aucune base, aucune horloge. Il lit la réponse
// JSON d'Open-Meteo (prévisions /v1/forecast ou archive /v1/archive, même
// forme) et la résume par SERVICE (midi, soir) : c'est à ces heures-là que la
// météo change les tickets, pas à 4 h du matin.
//
// Une valeur absente reste ABSENTE : `null` n'est jamais lu comme « 0 mm ».
// (Constaté le 2026-10-06 : l'archive ERA5-Land renvoie la pluie entièrement
// vide pour Kraainem, et `past_days` laisse des heures vides.) Un service dont
// une heure manque le dit (`missingHours`) et ne lève aucun drapeau sur la
// variable inconnue.
//
// Les seuils des drapeaux sont des valeurs de DÉPART, à recaler sur les
// tickets de chaque établissement (« chez vous, la pluie fait +22 % ») contre
// le groupe témoin (ADR 0063). Il ne choisit PAS l'action : c'est le rôle du
// moteur du copilote. Rien ici n'atteint un membre (ADR 0007).
// ============================================================

/** Une heure, en heure LOCALE de l'établissement (« 2026-10-06T12:00 »). */
export type WeatherHour = {
  time: string;
  temperature: number | null; // °C
  apparentTemperature: number | null; // °C ressentis
  precipitation: number | null; // mm, pluie + averses + neige fondue
  precipitationProbability: number | null; // % — prévisions seulement
  snowfall: number | null; // cm
  windSpeed: number | null; // km/h à 10 m
  weatherCode: number | null; // code WMO
};

export type WeatherRead = {
  /** Point de grille réellement servi (≠ coordonnées demandées). */
  latitude: number;
  longitude: number;
  timezone: string;
  hours: WeatherHour[];
};

export type ServiceName = "midi" | "soir";

/** Heures de début incluses, heure locale : midi 11 h–14 h, soir 18 h–22 h. */
export const SERVICES: Record<ServiceName, readonly number[]> = {
  midi: [11, 12, 13],
  soir: [18, 19, 20, 21],
};

export type WeatherFlag = "pluie" | "orage" | "neige" | "froid" | "chaleur" | "vent";

/** Seuils de départ (voir en-tête : à recaler sur les tickets). */
export const THRESHOLDS = {
  rainMm: 1, // cumul sur le service
  rainProbabilityPct: 60, // probabilité max sur le service
  coldApparentC: 3, // ressenti min
  hotApparentC: 28, // ressenti max
  windKmh: 50, // vent max
  thunderCode: 95, // codes WMO 95–99 = orage
} as const;

export type ServiceWeather = {
  date: string; // AAAA-MM-JJ local
  service: ServiceName;
  /** Heures du service présentes dans la réponse. */
  hours: number;
  /** Heures du service avec au moins une variable absente (ou heure absente). */
  missingHours: number;
  precipitationMm: number | null;
  maxPrecipitationProbability: number | null;
  minApparentTemperature: number | null;
  maxApparentTemperature: number | null;
  maxWindSpeed: number | null;
  snowfallCm: number | null;
  /** Code WMO le plus élevé ≈ le temps le plus marquant du service. */
  worstWeatherCode: number | null;
  flags: WeatherFlag[];
};

// ── Lecture de la réponse ───────────────────────────────────────────────────

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** Colonne nommée ; absente de la réponse → que des `null` (variable non servie). */
function column(hourly: Record<string, unknown>, key: string, length: number): (number | null)[] {
  const col = hourly[key];
  if (!Array.isArray(col)) return Array.from({ length }, () => null);
  return Array.from({ length }, (_, i) => num(col[i]));
}

const LOCAL_HOUR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Réponse Open-Meteo → heures typées. `null` si la forme n'est pas celle
 * attendue (pas de `hourly.time`, heures non locales) : l'appelant le dit,
 * il ne conclut pas « beau temps ».
 */
export function parseOpenMeteoHourly(raw: unknown): WeatherRead | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const hourly = r.hourly && typeof r.hourly === "object" ? (r.hourly as Record<string, unknown>) : null;
  const times = hourly?.time;
  if (!hourly || !Array.isArray(times) || !times.every((t) => typeof t === "string" && LOCAL_HOUR.test(t))) {
    return null;
  }
  const latitude = num(r.latitude);
  const longitude = num(r.longitude);
  if (latitude === null || longitude === null || typeof r.timezone !== "string") return null;

  const n = times.length;
  const c = (key: string) => column(hourly, key, n);
  const temperature = c("temperature_2m");
  const apparent = c("apparent_temperature");
  const precipitation = c("precipitation");
  const probability = c("precipitation_probability");
  const snowfall = c("snowfall");
  const wind = c("wind_speed_10m");
  const code = c("weather_code");

  return {
    latitude,
    longitude,
    timezone: r.timezone,
    hours: (times as string[]).map((time, i) => ({
      time,
      temperature: temperature[i],
      apparentTemperature: apparent[i],
      precipitation: precipitation[i],
      precipitationProbability: probability[i],
      snowfall: snowfall[i],
      windSpeed: wind[i],
      weatherCode: code[i],
    })),
  };
}

// ── Résumé par service ──────────────────────────────────────────────────────

/** Variables qui doivent être présentes pour qu'une heure soit complète. */
type Required = "apparentTemperature" | "precipitation" | "windSpeed" | "weatherCode";
const REQUIRED: Required[] = ["apparentTemperature", "precipitation", "windSpeed", "weatherCode"];

/** Agrège une variable ; `null` dès qu'UNE heure manque — jamais un total partiel. */
function agg(values: (number | null)[], expected: number, f: (xs: number[]) => number): number | null {
  if (values.length < expected || values.some((v) => v === null)) return null;
  return f(values as number[]);
}

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10;
const max = (xs: number[]) => Math.max(...xs);
const min = (xs: number[]) => Math.min(...xs);

export function summarizeServices(read: WeatherRead): ServiceWeather[] {
  const byDate = new Map<string, Map<number, WeatherHour>>();
  for (const h of read.hours) {
    const date = h.time.slice(0, 10);
    const hour = Number(h.time.slice(11, 13));
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date)!.set(hour, h);
  }

  const out: ServiceWeather[] = [];
  for (const [date, hours] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    for (const service of Object.keys(SERVICES) as ServiceName[]) {
      const wanted = SERVICES[service];
      const present = wanted.map((h) => hours.get(h)).filter((h): h is WeatherHour => !!h);
      if (present.length === 0) continue; // jour hors fenêtre (bord de la réponse)
      const expected = wanted.length;
      const missingHours =
        expected - present.length + present.filter((h) => REQUIRED.some((k) => h[k] === null)).length;

      const pick = (k: keyof Omit<WeatherHour, "time">) => present.map((h) => h[k]);
      const s: ServiceWeather = {
        date,
        service,
        hours: present.length,
        missingHours,
        precipitationMm: agg(pick("precipitation"), expected, sum),
        maxPrecipitationProbability: agg(pick("precipitationProbability"), expected, max),
        minApparentTemperature: agg(pick("apparentTemperature"), expected, min),
        maxApparentTemperature: agg(pick("apparentTemperature"), expected, max),
        maxWindSpeed: agg(pick("windSpeed"), expected, max),
        snowfallCm: agg(pick("snowfall"), expected, sum),
        worstWeatherCode: agg(pick("weatherCode"), expected, max),
        flags: [],
      };
      s.flags = flagsOf(s);
      out.push(s);
    }
  }
  return out;
}

/** Drapeaux levés sur ce qui est CONNU ; une variable inconnue ne lève rien. */
export function flagsOf(s: ServiceWeather): WeatherFlag[] {
  const f: WeatherFlag[] = [];
  const t = THRESHOLDS;
  if (
    (s.precipitationMm !== null && s.precipitationMm >= t.rainMm) ||
    (s.maxPrecipitationProbability !== null && s.maxPrecipitationProbability >= t.rainProbabilityPct)
  ) {
    f.push("pluie");
  }
  if (s.worstWeatherCode !== null && s.worstWeatherCode >= t.thunderCode) f.push("orage");
  if (s.snowfallCm !== null && s.snowfallCm > 0) f.push("neige");
  if (s.minApparentTemperature !== null && s.minApparentTemperature <= t.coldApparentC) f.push("froid");
  if (s.maxApparentTemperature !== null && s.maxApparentTemperature >= t.hotApparentC) f.push("chaleur");
  if (s.maxWindSpeed !== null && s.maxWindSpeed >= t.windKmh) f.push("vent");
  return f;
}
