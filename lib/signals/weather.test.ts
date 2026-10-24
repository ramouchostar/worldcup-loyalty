import { test } from "node:test";
import assert from "node:assert/strict";
import googleForecast from "./weather-google-forecast.fixture.json";
import googleHistory from "./weather-google-history.fixture.json";
import archiveFixture from "./weather-archive.fixture.json";
import {
  countMissingHours,
  flagsOf,
  parseGoogleWeatherHours,
  parseOpenMeteoHourly,
  summarizeServices,
  type ServiceWeather,
  type WeatherRead,
} from "./weather";

// Fixtures : vraies réponses lues le 2026-10-06 pour Kraainem — Google Weather
// (7 pages de prévisions, 24 h d'historique ; champs inutiles retirés) et
// archive Open-Meteo.
const kraainem = { latitude: 50.8490066, longitude: 4.4588551 };

test("Google, prévisions : 7 pages → 168 heures locales consécutives, rien de vide", () => {
  const r = parseGoogleWeatherHours(googleForecast as unknown[], kraainem)!;
  assert.equal(r.hours.length, 168);
  assert.equal(r.timezone, "Europe/Brussels");
  assert.equal(r.hours[0].time, "2026-10-06T15:00"); // 13:00 UTC = 15:00 à Bruxelles
  assert.equal(r.hours.at(-1)!.time, "2026-10-13T14:00");
  assert.equal(countMissingHours(r), 0);
  assert.equal(r.latitude, kraainem.latitude); // Google ne renvoie pas le point servi
});

test("Google, prévisions : mercredi soir pluvieux, jeudi midi pas assez pour un drapeau", () => {
  const s = summarizeServices(parseGoogleWeatherHours(googleForecast as unknown[], kraainem)!);
  const wedEvening = s.find((x) => x.date === "2026-10-07" && x.service === "soir")!;
  assert.equal(wedEvening.precipitationMm, 6.7);
  assert.equal(wedEvening.maxPrecipitationProbability, 75);
  assert.deepEqual(wedEvening.conditions, ["RAIN_SHOWERS", "RAIN"]);
  assert.deepEqual(wedEvening.flags, ["pluie"]);
  const thuLunch = s.find((x) => x.date === "2026-10-08" && x.service === "midi")!;
  assert.equal(thuLunch.precipitationMm, 0.5);
  assert.deepEqual(thuLunch.flags, []);
  // Le midi du 6 est déjà passé à la lecture (15 h) : pas de service inventé.
  assert.equal(s.some((x) => x.date === "2026-10-06" && x.service === "midi"), false);
});

test("Google, historique : arrive du plus récent au plus ancien, ressort trié", () => {
  const r = parseGoogleWeatherHours([googleHistory], kraainem)!;
  assert.equal(r.hours.length, 24);
  assert.equal(r.hours[0].time, "2026-10-05T15:00");
  assert.equal(r.hours.at(-1)!.time, "2026-10-06T14:00");
});

test("Google : unité inattendue → valeur inconnue, jamais convertie en silence", () => {
  const page = structuredClone(googleHistory) as { historyHours: { temperature: { unit: string } }[] };
  page.historyHours[0].temperature.unit = "FAHRENHEIT";
  const r = parseGoogleWeatherHours([page], kraainem)!;
  assert.equal(r.hours.at(-1)!.temperature, null);
});

test("Google : forme inattendue → null", () => {
  assert.equal(parseGoogleWeatherHours([{ error: { code: 403 } }], kraainem), null);
  assert.equal(parseGoogleWeatherHours([{ forecastHours: [{}], timeZone: { id: "Europe/Brussels" } }], kraainem), null);
  assert.equal(parseGoogleWeatherHours([{ forecastHours: [] }], kraainem), null); // sans fuseau
});

test("archive Open-Meteo réelle : pas de probabilité (c'est ce qui est tombé), la pluie se lit au cumul", () => {
  const r = parseOpenMeteoHourly(archiveFixture)!;
  const s = summarizeServices(r);
  assert.equal(r.hours.length, 168);
  assert.ok(r.hours.every((h) => h.precipitationProbability === null));
  const monLunch = s.find((x) => x.date === "2026-09-28" && x.service === "midi")!;
  assert.equal(monLunch.maxPrecipitationProbability, null);
  assert.equal(monLunch.precipitationMm, 2);
  assert.deepEqual(monLunch.flags, ["pluie"]);
  assert.equal(monLunch.missingHours, 0);
});

// Réponse minimale fabriquée : un jour, heures du midi.
function day(over: Partial<Record<string, (number | null)[]>> = {}) {
  const hours = [11, 12, 13];
  return {
    latitude: 50.854,
    longitude: 4.466,
    timezone: "Europe/Brussels",
    hourly: {
      time: hours.map((h) => `2026-10-06T${h}:00`),
      apparent_temperature: [15, 16, 17],
      precipitation: [0, 0, 0],
      precipitation_probability: [10, 10, 10],
      snowfall: [0, 0, 0],
      wind_speed_10m: [10, 10, 10],
      weather_code: [3, 3, 3],
      ...over,
    },
  };
}

test("une heure de pluie absente n'est JAMAIS lue comme 0 mm (cas ERA5-Land)", () => {
  const [s] = summarizeServices(parseOpenMeteoHourly(day({ precipitation: [0, null, 0] }))!);
  assert.equal(s.precipitationMm, null);
  assert.equal(s.missingHours, 1);
  assert.deepEqual(s.flags, []); // inconnu ≠ sec, mais inconnu ne lève rien non plus
});

test("une variable que la réponse ne sert pas reste inconnue, l'heure est comptée manquante", () => {
  const raw = day();
  delete (raw.hourly as Record<string, unknown>).precipitation;
  const [s] = summarizeServices(parseOpenMeteoHourly(raw)!);
  assert.equal(s.precipitationMm, null);
  assert.equal(s.missingHours, 3);
});

test("une heure du service absente de la réponse : cumul inconnu plutôt que partiel", () => {
  const raw = day();
  raw.hourly.time = raw.hourly.time.slice(0, 2);
  for (const k of Object.keys(raw.hourly) as (keyof typeof raw.hourly)[]) {
    if (k !== "time") (raw.hourly[k] as unknown[]) = (raw.hourly[k] as unknown[]).slice(0, 2);
  }
  const [s] = summarizeServices(parseOpenMeteoHourly(raw)!);
  assert.equal(s.hours, 2);
  assert.equal(s.missingHours, 1);
  assert.equal(s.precipitationMm, null);
});

test("forme inattendue → null : jamais « beau temps » par défaut", () => {
  assert.equal(parseOpenMeteoHourly(null), null);
  assert.equal(parseOpenMeteoHourly({ error: true, reason: "Latitude must be in range" }), null);
  assert.equal(parseOpenMeteoHourly({ ...day(), hourly: { time: [1, 2] } }), null);
  // Heures en UTC (« Z ») : timezone oubliée, les services tomberaient 2 h trop tôt.
  assert.equal(parseOpenMeteoHourly({ ...day(), hourly: { time: ["2026-10-06T11:00Z"] } }), null);
});

test("drapeaux : seuils de départ", () => {
  const base: ServiceWeather = {
    date: "2026-10-06",
    service: "soir",
    hours: 4,
    missingHours: 0,
    precipitationMm: 0,
    maxPrecipitationProbability: 0,
    minApparentTemperature: 15,
    maxApparentTemperature: 18,
    maxWindSpeed: 10,
    snowfallCm: 0,
    worstWeatherCode: 3,
    maxThunderstormProbability: 0,
    conditions: [],
    flags: [],
  };
  assert.deepEqual(flagsOf(base), []);
  assert.deepEqual(flagsOf({ ...base, precipitationMm: 1 }), ["pluie"]);
  assert.deepEqual(flagsOf({ ...base, maxPrecipitationProbability: 60 }), ["pluie"]);
  assert.deepEqual(flagsOf({ ...base, worstWeatherCode: 95 }), ["orage"]);
  assert.deepEqual(flagsOf({ ...base, maxThunderstormProbability: 50 }), ["orage"]);
  assert.deepEqual(flagsOf({ ...base, conditions: ["SCATTERED_THUNDERSTORMS"] }), ["orage"]);
  assert.deepEqual(flagsOf({ ...base, snowfallCm: 0.2, minApparentTemperature: -2 }), ["neige", "froid"]);
  assert.deepEqual(flagsOf({ ...base, maxApparentTemperature: 28 }), ["chaleur"]);
  assert.deepEqual(flagsOf({ ...base, maxWindSpeed: 50 }), ["vent"]);
});

test("les services suivent l'heure locale de la réponse", () => {
  const r: WeatherRead = {
    latitude: 0,
    longitude: 0,
    timezone: "Europe/Brussels",
    hours: [
      {
        time: "2026-10-06T10:00",
        temperature: 1,
        apparentTemperature: 1,
        precipitation: 5,
        precipitationProbability: 90,
        snowfall: 0,
        windSpeed: 1,
        thunderstormProbability: null,
        condition: "RAIN",
        weatherCode: null,
      },
    ],
  };
  assert.deepEqual(summarizeServices(r), []); // 10 h n'est ni le midi ni le soir
});
