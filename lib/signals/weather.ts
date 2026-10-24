// ============================================================
// Signal « météo » — prévisions Google Weather, historique Open-Meteo
// (backlog plateforme, décidé le 2026-10-01 ; ADR 0074 §8).
//
// Module PUR : aucun réseau, aucune base, aucune horloge. Il lit deux formes
// de réponse vers les MÊMES heures typées, puis les résume par SERVICE (midi,
// soir) : c'est à ces heures-là que la météo change les tickets.
//   - Google Weather (forecast/hours, history/hours) : prévisions 7 jours et
//     dernières 24 h — source retenue le 2026-10-06 (usage commercial permis,
//     contrairement à l'offre gratuite d'Open-Meteo).
//   - Open-Meteo (archive) : seulement pour amorcer le calage sur le passé,
//     Google ne servant que 24 h d'historique.
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
  /** Probabilité d'orage, % — Google seulement. */
  thunderstormProbability: number | null;
  /** Type de temps Google (« LIGHT_RAIN », « THUNDERSTORM »…) — Google seulement. */
  condition: string | null;
  weatherCode: number | null; // code WMO — Open-Meteo seulement
};

export type WeatherRead = {
  /** Point de grille réellement servi (≠ coordonnées demandées). */
  latitude: number;
  longitude: number;
  timezone: string;
  hours: WeatherHour[];
};

export type Coordinates = { latitude: number; longitude: number };

export function validCoordinates(c: Coordinates): boolean {
  return (
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
  );
}

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
  thunderProbabilityPct: 50, // probabilité d'orage max (Google)
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
  /** Code WMO le plus élevé ≈ le temps le plus marquant du service (Open-Meteo). */
  worstWeatherCode: number | null;
  maxThunderstormProbability: number | null;
  /** Types de temps Google rencontrés sur le service, sans doublon. */
  conditions: string[];
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
      thunderstormProbability: null,
      condition: null,
      weatherCode: code[i],
    })),
  };
}

// ── Lecture Google Weather ──────────────────────────────────────────────────

type GoogleHour = {
  displayDateTime?: { year?: number; month?: number; day?: number; hours?: number };
  weatherCondition?: { type?: unknown };
  temperature?: { degrees?: unknown; unit?: unknown };
  feelsLikeTemperature?: { degrees?: unknown; unit?: unknown };
  precipitation?: { probability?: { percent?: unknown }; qpf?: { quantity?: unknown; unit?: unknown }; snowQpf?: { quantity?: unknown } };
  wind?: { speed?: { value?: unknown; unit?: unknown } };
  thunderstormProbability?: unknown;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Heure LOCALE affichée par Google (« displayDateTime », déjà au fuseau du lieu). */
function googleLocalHour(h: GoogleHour): string | null {
  const d = h.displayDateTime;
  if (!d || ![d.year, d.month, d.day, d.hours].every((x) => typeof x === "number")) return null;
  return `${d.year}-${pad(d.month!)}-${pad(d.day!)}T${pad(d.hours!)}:00`;
}

/** Une unité inattendue (FAHRENHEIT, MILES_PER_HOUR, INCHES) → valeur inconnue, jamais convertie en silence. */
function inUnit(v: { unit?: unknown } | undefined, unit: string, x: unknown): number | null {
  if (!v || (v.unit !== undefined && v.unit !== unit)) return null;
  return num(x);
}

/**
 * Pages Google Weather (forecastHours ou historyHours) → heures typées, triées
 * (l'historique arrive du plus récent au plus ancien). `null` si aucune page
 * n'a la forme attendue ou si une heure n'a pas d'heure locale lisible.
 * Google ne renvoie pas le point servi : on garde les coordonnées demandées.
 */
export function parseGoogleWeatherHours(
  pages: unknown[],
  at: Coordinates
): WeatherRead | null {
  const list: GoogleHour[] = [];
  let timezone: string | null = null;
  for (const p of pages) {
    if (!p || typeof p !== "object") return null;
    const r = p as Record<string, unknown>;
    const hours = r.forecastHours ?? r.historyHours;
    if (!Array.isArray(hours)) return null;
    const tz = (r.timeZone as { id?: unknown } | undefined)?.id;
    if (typeof tz === "string") timezone = tz;
    list.push(...(hours as GoogleHour[]));
  }
  if (!timezone) return null;

  const out: WeatherHour[] = [];
  for (const h of list) {
    const time = googleLocalHour(h);
    if (!time) return null;
    const pr = h.precipitation;
    const rain = inUnit(pr?.qpf, "MILLIMETERS", pr?.qpf?.quantity);
    const snowMm = num(pr?.snowQpf?.quantity);
    out.push({
      time,
      temperature: inUnit(h.temperature, "CELSIUS", h.temperature?.degrees),
      apparentTemperature: inUnit(h.feelsLikeTemperature, "CELSIUS", h.feelsLikeTemperature?.degrees),
      precipitation: rain,
      precipitationProbability: num(pr?.probability?.percent),
      // Google donne la neige en équivalent eau (mm) ; 1 mm d'eau ≈ 1 cm de
      // neige — approximation suffisante : seul « il neige » compte ici.
      snowfall: snowMm,
      windSpeed: inUnit(h.wind?.speed, "KILOMETERS_PER_HOUR", h.wind?.speed?.value),
      thunderstormProbability: num(h.thunderstormProbability),
      condition: typeof h.weatherCondition?.type === "string" ? h.weatherCondition.type : null,
      weatherCode: null,
    });
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  return { latitude: at.latitude, longitude: at.longitude, timezone, hours: out };
}

// ── Résumé par service ──────────────────────────────────────────────────────

/** Variables qui doivent être présentes pour qu'une heure soit complète (servies par les deux sources). */
type Required = "apparentTemperature" | "precipitation" | "windSpeed";
export const REQUIRED: Required[] = ["apparentTemperature", "precipitation", "windSpeed"];

/** Heures où l'une des variables utiles est absente (`null`). */
export function countMissingHours(read: WeatherRead): number {
  return read.hours.filter((h) => REQUIRED.some((k) => h[k] === null)).length;
}

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

      const pick = (k: Exclude<keyof WeatherHour, "time" | "condition">) => present.map((h) => h[k]);
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
        maxThunderstormProbability: agg(pick("thunderstormProbability"), expected, max),
        conditions: [...new Set(present.map((h) => h.condition).filter((c): c is string => !!c))],
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
  if (
    (s.worstWeatherCode !== null && s.worstWeatherCode >= t.thunderCode) ||
    (s.maxThunderstormProbability !== null && s.maxThunderstormProbability >= t.thunderProbabilityPct) ||
    s.conditions.some((c) => c.includes("THUNDER"))
  ) {
    f.push("orage");
  }
  if (s.snowfallCm !== null && s.snowfallCm > 0) f.push("neige");
  if (s.minApparentTemperature !== null && s.minApparentTemperature <= t.coldApparentC) f.push("froid");
  if (s.maxApparentTemperature !== null && s.maxApparentTemperature >= t.hotApparentC) f.push("chaleur");
  if (s.maxWindSpeed !== null && s.maxWindSpeed >= t.windKmh) f.push("vent");
  return f;
}
