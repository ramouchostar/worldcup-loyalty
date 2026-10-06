import { test } from "node:test";
import assert from "node:assert/strict";
import forecastFixture from "./weather-forecast.fixture.json";
import archiveFixture from "./weather-archive.fixture.json";
import { flagsOf, parseOpenMeteoHourly, summarizeServices, type ServiceWeather, type WeatherRead } from "./weather";

// Fixtures : vraies réponses Open-Meteo pour Kraainem (centre de la commune),
// lues le 2026-10-06 avec forecastUrl / archiveUrl.

test("prévisions réelles : 168 heures locales, point de grille servi, rien de vide", () => {
  const r = parseOpenMeteoHourly(forecastFixture)!;
  assert.equal(r.hours.length, 168);
  assert.equal(r.timezone, "Europe/Brussels");
  assert.equal(r.hours[0].time, "2026-10-06T00:00");
  assert.equal(r.hours.at(-1)!.time, "2026-10-12T23:00");
  assert.ok(r.hours.every((h) => h.precipitation !== null && h.precipitationProbability !== null));
});

test("prévisions réelles : 7 jours × midi et soir, mercredi soir pluvieux", () => {
  const s = summarizeServices(parseOpenMeteoHourly(forecastFixture)!);
  assert.equal(s.length, 14);
  const wedEvening = s.find((x) => x.date === "2026-10-07" && x.service === "soir")!;
  assert.equal(wedEvening.precipitationMm, 3.3);
  assert.equal(wedEvening.maxPrecipitationProbability, 100);
  assert.deepEqual(wedEvening.flags, ["pluie"]);
  const tueLunch = s.find((x) => x.date === "2026-10-06" && x.service === "midi")!;
  assert.deepEqual(tueLunch.flags, []);
  assert.equal(tueLunch.missingHours, 0);
});

test("archive réelle : pas de probabilité (c'est ce qui est tombé), la pluie se lit au cumul", () => {
  const r = parseOpenMeteoHourly(archiveFixture)!;
  const s = summarizeServices(r);
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
    flags: [],
  };
  assert.deepEqual(flagsOf(base), []);
  assert.deepEqual(flagsOf({ ...base, precipitationMm: 1 }), ["pluie"]);
  assert.deepEqual(flagsOf({ ...base, maxPrecipitationProbability: 60 }), ["pluie"]);
  assert.deepEqual(flagsOf({ ...base, worstWeatherCode: 95 }), ["orage"]);
  assert.deepEqual(flagsOf({ ...base, snowfallCm: 0.2, minApparentTemperature: -2 }), ["neige", "froid"]);
  assert.deepEqual(flagsOf({ ...base, maxApparentTemperature: 28 }), ["chaleur"]);
  assert.deepEqual(flagsOf({ ...base, maxWindSpeed: 50 }), ["vent"]);
});

test("les services suivent l'heure locale de la réponse", () => {
  const r: WeatherRead = {
    latitude: 0,
    longitude: 0,
    timezone: "Europe/Brussels",
    hours: [{ time: "2026-10-06T10:00", temperature: 1, apparentTemperature: 1, precipitation: 5, precipitationProbability: 90, snowfall: 0, windSpeed: 1, weatherCode: 61 }],
  };
  assert.deepEqual(summarizeServices(r), []); // 10 h n'est ni le midi ni le soir
});
