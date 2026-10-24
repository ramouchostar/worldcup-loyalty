import { test } from "node:test";
import assert from "node:assert/strict";
import { dayReasons, relevantMatches } from "./day-reasons";
import type { ServiceWeather } from "./signals/weather";
import type { FootballMatch } from "./signals/football";

const service = (over: Partial<ServiceWeather>): ServiceWeather => ({
  date: "2026-10-20",
  service: "soir",
  hours: 4,
  missingHours: 0,
  precipitationMm: 0,
  maxPrecipitationProbability: 0,
  minApparentTemperature: 10,
  maxApparentTemperature: 12,
  maxWindSpeed: 10,
  snowfallCm: 0,
  worstWeatherCode: null,
  maxThunderstormProbability: null,
  conditions: [],
  flags: [],
  ...over,
});

const match = (over: Partial<FootballMatch>): FootballMatch => ({
  id: 1,
  competitionId: 14,
  competition: "Pro League (Belgique)",
  competitionCountry: "Belgium",
  isWomen: false,
  home: "Anderlecht",
  away: "Club Brugge",
  homeId: null,
  awayId: null,
  homeCountry: null,
  awayCountry: null,
  kickoffUtc: "2026-10-20T18:45:00Z", // 20 h 45 à Bruxelles
  status: "finished",
  round: null,
  isLocalDerby: false,
  venue: null,
  ...over,
});

const base = { day: "2026-10-20", weather: [], matches: [], events: [], publicHoliday: null, schoolHoliday: null };

test("météo : des faits par service, le soir d'abord, rien si le temps était ordinaire", () => {
  const r = dayReasons({
    ...base,
    weather: [
      service({ service: "midi", flags: [] }),
      service({ service: "soir", flags: ["pluie", "froid"], precipitationMm: 6.2, minApparentTemperature: 2 }),
    ],
  });
  assert.deepEqual(r.facts, ["Soir : pluie (6,2 mm), froid (ressenti 2 °C)"]);
  assert.deepEqual(r.unknown, []);
});

test("météo inconnue : on le dit, on n'invente rien", () => {
  assert.deepEqual(dayReasons(base), { facts: [], unknown: ["météo"] });
});

test("matchs : Pro League, coupes d'Europe, sélections suivies, le soir seulement", () => {
  const ms = [
    match({ id: 1 }),
    match({ id: 2, competitionId: 7, competition: "Ligue des champions", home: "Real", away: "City", kickoffUtc: "2026-10-20T19:00:00Z" }),
    match({ id: 3, competitionId: 31, competition: "Amicaux", home: "France", away: "Italie" }), // sélection non suivie
    match({ id: 4, competitionId: 31, competition: "Amicaux", home: "Belgique", away: "Maroc" }),
    match({ id: 5, kickoffUtc: "2026-10-20T11:00:00Z" }), // 13 h : hors service du soir
    match({ id: 6, competitionId: 97 }), // Challenger Pro League : non
    match({ id: 7, isWomen: true }),
    match({ id: 8, status: "postponed" }),
  ];
  assert.deepEqual(relevantMatches(ms, "2026-10-20").map((m) => m.id), [1, 4, 2]);
  const r = dayReasons({ ...base, weather: [service({})], matches: ms });
  assert.deepEqual(r.facts, [
    "Match Anderlecht – Club Brugge à 20 h 45 (Pro League (Belgique))",
    "Match Belgique – Maroc à 20 h 45 (Amicaux)",
  ]);
});

test("événements : grande salle ou à moins de 1,5 km ; férié et vacances en tête ; quatre faits au plus", () => {
  const r = dayReasons({
    ...base,
    weather: [service({ flags: ["pluie"], precipitationMm: 3 })],
    events: [
      { name: "Petit concert", distanceKm: 2.4, highCapacity: false },
      { name: "Marché de nuit", distanceKm: 0.6, highCapacity: false },
      { name: "Concert au Palais 12", distanceKm: 4.1, highCapacity: true },
    ],
    publicHoliday: "Toussaint",
    schoolHoliday: "Congé d'automne (Toussaint) (FWB)",
  });
  assert.deepEqual(r.facts, [
    "Jour férié : Toussaint",
    "Vacances scolaires : Congé d'automne (Toussaint) (FWB)",
    "Soir : pluie (3 mm)",
    "Événement à 4,1 km : Concert au Palais 12",
  ]);
});
