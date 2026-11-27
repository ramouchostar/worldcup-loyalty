import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBzzoiroEvents, type FootballMatch } from "../../signals/football";
import { parseGoogleWeatherHours, type WeatherHour, type WeatherRead } from "../../signals/weather";
import { agendaRow, HERE } from "./testing";
import { eventCandidates, eventSource } from "./sources/events";
import { matchCandidates, matchSource } from "./sources/matches";
import { promoSource } from "./sources/promos";
import { skyOf, weatherSource } from "./sources/weather";

const DAY = "2026-11-28";
const NOW = new Date("2026-11-27T16:00:00Z");
const WINDOW = { from: DAY, to: "2026-11-30" };
const ctx = { restaurantId: "r", coords: HERE, now: NOW };
const fresh = (over = {}) => agendaRow(DAY, { synced_at: "2026-11-27T02:00:00Z", ...over });

test("événements : voisins, des catégories retenues, non annulés et vérifiés récemment ; la distance est dite", () => {
  const [c] = eventCandidates([fresh()], HERE, WINDOW, NOW);
  assert.equal(c.sourceKey, "evenement:visitbrussels:ev1:2026-11");
  assert.equal(c.days[0].facts.kind === "evenement" && c.days[0].facts.distanceM, 600);
  assert.equal(c.days[0].expiresAt, "2026-11-28T23:00:00.000Z");
  const out = [
    fresh({ is_canceled: true }),
    fresh({ category: "expo" }),
    fresh({ lat: HERE.lat + 0.02 }),
    fresh({ lat: null }),
    fresh({ synced_at: "2026-11-20T00:00:00Z" }),
    fresh({ source: "ailleurs" }),
    fresh({ ends_at: `${DAY}T08:30:00Z` }), // fini avant 10 h
    agendaRow("2026-12-15", { synced_at: "2026-11-27T02:00:00Z" }),
    fresh({ name: "  " }),
  ];
  for (const row of out) assert.deepEqual(eventCandidates([row], HERE, WINDOW, NOW), [], JSON.stringify(row));
});

test("un événement sur plusieurs jours ou séances : une seule occasion, ses jours possibles", () => {
  const rows = [fresh(), fresh({ external_id: "ev1:bis" }), fresh({ external_id: "ev1:29", day: "2026-11-29", ends_at: null })];
  const list = eventCandidates(rows, HERE, WINDOW, NOW);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].days.map((d) => d.day), [DAY, "2026-11-29"]);
});

test("événement revérifié : disparu, annulé, trop vieux, renommé, illisible", async () => {
  const [c] = eventCandidates([fresh()], HERE, WINDOW, NOW);
  const facts = c.days[0].facts;
  const check = (row: ReturnType<typeof fresh> | null, fail = false) =>
    eventSource({ nearby: async () => [], one: async () => { if (fail) throw new Error("panne"); return row; } }).recheck(ctx, facts);
  assert.deepEqual(await check(fresh()), { ok: true });
  assert.deepEqual(await check(null), { ok: false, reason: "evenement_disparu" });
  assert.deepEqual(await check(fresh({ day: "2026-11-29" })), { ok: false, reason: "evenement_disparu" });
  assert.deepEqual(await check(fresh({ is_canceled: true })), { ok: false, reason: "evenement_annule" });
  assert.deepEqual(await check(fresh({ synced_at: "2026-11-20T00:00:00Z" })), { ok: false, reason: "agenda_perime" });
  assert.deepEqual(await check(fresh({ name: "Autre chose" })), { ok: false, reason: "evenement_disparu" });
  assert.deepEqual(await check(null, true), { ok: false, reason: "source_indisponible" });
  const noPosition = await eventSource({ nearby: async () => [], one: async () => null }).read({ ...ctx, coords: null }, WINDOW);
  assert.equal(noPosition.ok, false);
});

const fixture = JSON.parse(readFileSync(join(process.cwd(), "lib", "signals", "football.fixture.json"), "utf8"));
const all = parseBzzoiroEvents(fixture);
const match = (over: Partial<FootballMatch>): FootballMatch => ({ ...all[0], competitionId: 14, kickoffUtc: `${DAY}T19:45:00Z`, status: "notstarted", isWomen: false, ...over });

test("matchs : un par jour, la sélection d'abord, puis la Pro League ; fin trois heures après le coup d'envoi", () => {
  const list = matchCandidates(
    [
      match({ id: 1, competitionId: 7, home: "Anderlecht", away: "Porto" }),
      match({ id: 2, home: "Genk", away: "Gand" }),
      match({ id: 3, competitionId: 64, home: "Belgique", away: "Italie" }),
      match({ id: 4, home: "Matin", away: "Midi", kickoffUtc: "2026-11-29T11:00:00Z" }),
      match({ id: 5, home: "Reporté", away: "Hier", kickoffUtc: "2026-11-30T19:00:00Z", status: "postponed" }),
    ],
    WINDOW,
  );
  assert.deepEqual(list.map((c) => c.sourceKey), ["match:bzzoiro:3"]);
  assert.equal(list[0].days[0].expiresAt, "2026-11-28T22:45:00.000Z");
});

test("matchs : sans clé, rien et on le dit ; revérifié au jour même", async () => {
  const none = matchSource(async () => assert.fail("aucune lecture sans clé"), false);
  assert.match(none.unavailable()!, /BZZOIRO_API_KEY/);
  assert.equal((await none.read(ctx, WINDOW)).ok, false);

  const facts = matchCandidates([match({ id: 2, home: "Genk", away: "Gand" })], WINDOW)[0].days[0].facts;
  const check = (matches: FootballMatch[], ok = true) =>
    matchSource(async () => ({ ok, matches, perCompetition: {}, errors: ok ? [] : ["panne"] }), true).recheck(ctx, facts);
  assert.deepEqual(await check([match({ id: 2, home: "Genk", away: "Gand" })]), { ok: true });
  assert.deepEqual(await check([match({ id: 2, home: "Genk", away: "Gand", status: "postponed" })]), { ok: false, reason: "match_change" });
  assert.deepEqual(await check([match({ id: 2, home: "Genk", away: "Gand", kickoffUtc: `${DAY}T17:00:00Z` })]), { ok: false, reason: "match_change" });
  assert.deepEqual(await check([]), { ok: false, reason: "match_change" });
  assert.deepEqual(await check([], false), { ok: false, reason: "source_indisponible" });
});

const hour = (h: number, over: Partial<WeatherHour> = {}): WeatherHour => ({
  time: `${DAY}T${String(h).padStart(2, "0")}:00`, temperature: 14, apparentTemperature: 13, precipitation: 0, precipitationProbability: 5,
  snowfall: 0, windSpeed: 10, thunderstormProbability: 0, condition: "CLEAR", weatherCode: null, ...over,
});
const read = (hours: WeatherHour[]): WeatherRead => ({ latitude: 0, longitude: 0, timezone: "Europe/Brussels", hours });
const noon = (over: Partial<WeatherHour> = {}) => read([hour(11), hour(12, over), hour(13)]);

test("météo : le soleil ne s'annonce jamais sans donnée", () => {
  assert.deepEqual(skyOf(noon(), DAY), { sky: "soleil", service: "midi" });
  assert.deepEqual(skyOf(noon({ condition: "MOSTLY_CLEAR" }), DAY), { sky: "soleil", service: "midi" });
  for (const over of [
    { condition: null }, { condition: "PARTLY_CLOUDY" }, { precipitation: null }, { precipitation: 0.2 },
    { precipitationProbability: null }, { precipitationProbability: 30 }, { apparentTemperature: null }, { apparentTemperature: 6 },
  ]) assert.equal(skyOf(noon(over), DAY), null, JSON.stringify(over));
  assert.equal(skyOf(read([hour(11), hour(13)]), DAY), null); // une heure manque
  assert.equal(skyOf(noon(), "2026-11-29"), null);
});

test("météo : la pluie sur un service complet ; la réponse d'exemple de Google se lit", () => {
  assert.deepEqual(skyOf(noon({ precipitation: 3, condition: "RAIN" }), DAY), { sky: "pluie", service: "midi" });
  assert.deepEqual(skyOf(read([18, 19, 20, 21].map((h) => hour(h, { precipitation: 1, condition: "RAIN" }))), DAY), { sky: "pluie", service: "soir" });
  assert.equal(skyOf(read([hour(12, { precipitation: 5 })]), DAY), null); // service incomplet
  assert.equal(skyOf(noon({ precipitation: 3, snowfall: 2 }), DAY), null);
  const pages = JSON.parse(readFileSync(join(process.cwd(), "lib", "signals", "weather-google-forecast.fixture.json"), "utf8"));
  const parsed = parseGoogleWeatherHours(pages, { latitude: 50.85, longitude: 4.35 })!;
  for (const day of new Set(parsed.hours.map((h) => h.time.slice(0, 10)))) {
    const sky = skyOf(parsed, day);
    assert.ok(sky === null || sky.sky === "soleil" || sky.sky === "pluie");
  }
});

test("météo éteinte et promos pas branchées : elles le disent et ne proposent rien", async () => {
  assert.match(weatherSource.unavailable()!, /Google/);
  assert.equal((await weatherSource.read(ctx, WINDOW)).ok, false);
  assert.ok(promoSource.unavailable());
  assert.deepEqual(await promoSource.read(ctx, WINDOW), { ok: true, candidates: [] });
  const facts = { kind: "promo" as const, offerId: "o", label: "x", day: DAY, endsDay: DAY };
  assert.deepEqual(await promoSource.recheck(ctx, facts), { ok: false, reason: "promo_finie" });
});
