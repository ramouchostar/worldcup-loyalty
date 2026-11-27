// Données INVENTÉES au format documenté (https://api.met.no/doc/ForecastJSON). Aucune demande réelle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetForecast } from "./weather-met";
import {
  metCoordinate, metForecastReader, metUrl, MIN_INTERVAL_MS, PAUSE_KEY, readUserAgent, REFUSED_PAUSE_MS,
  type CacheEntry, type ForecastCache,
} from "./weather-met-source";

const AGENT = "Appli-Inventee/1.0 https://exemple.invalid";
const AT = { lat: 50.850346, lng: 4.351721 };
const T0 = new Date("2026-11-27T15:23:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

const sample = (over: Record<string, unknown> = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [4.35, 50.85, 20] },
  properties: {
    meta: { updated_at: "2026-11-27T12:00:00Z", units: { air_temperature: "celsius", cloud_area_fraction: "%", precipitation_amount: "mm" } },
    timeseries: [
      { time: "2026-11-28T10:00:00Z", data: { instant: { details: { air_temperature: 8.1, cloud_area_fraction: 92.2 } }, next_1_hours: { summary: { symbol_code: "rain" }, details: { precipitation_amount: 1.3 } } } },
      { time: "2026-11-28T11:00:00Z", data: { instant: { details: { air_temperature: 8.4 } }, next_6_hours: { details: { precipitation_amount: 4 } } } },
      { time: "2026-12-05T12:00:00Z", data: { instant: { details: { air_temperature: 3 } } } },
    ],
    ...over,
  },
});

test("lecture : trois valeurs par heure, une valeur absente reste absente", () => {
  const f = parseMetForecast(sample())!;
  assert.equal(f.updatedAt, "2026-11-27T12:00:00Z");
  assert.deepEqual(f.hours[0], { time: "2026-11-28T10:00:00.000Z", airTemperature: 8.1, cloudAreaFraction: 92.2, precipitationNextHour: 1.3 });
  // La pluie sur 6 heures n'est pas une pluie « dans l'heure » ; la nébulosité absente n'est pas un ciel dégagé.
  assert.deepEqual([f.hours[1].precipitationNextHour, f.hours[1].cloudAreaFraction], [null, null]);
});

test("lecture : une unité inattendue ne se convertit pas, une forme inconnue ne se devine pas", () => {
  const odd = parseMetForecast(sample({ meta: { units: { air_temperature: "fahrenheit", cloud_area_fraction: "%" } } }))!;
  assert.deepEqual([odd.hours[0].airTemperature, odd.hours[0].precipitationNextHour, odd.hours[0].cloudAreaFraction], [null, null, 92.2]);
  for (const bad of [null, [], {}, { properties: {} }, sample({ timeseries: [] }), sample({ timeseries: [{ data: {} }] }), "x"]) {
    assert.equal(parseMetForecast(bad), null, JSON.stringify(bad));
  }
});

test("coordonnées : deux décimales, tronquées", () => {
  assert.deepEqual([metCoordinate(50.850346), metCoordinate(4.359999), metCoordinate(-0.5), metCoordinate(50)], ["50.85", "4.35", "-0.50", "50.00"]);
  assert.equal(metUrl(AT), "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=50.85&lon=4.35");
});

test("éteinte sans identification choisie : vide, sans contact, générique ou illisible", () => {
  for (const bad of [undefined, "", "   ", "MonAppli", "curl/8 https://exemple.invalid", "Appli é https://exemple.invalid", "Appli\r\nX: y https://exemple.invalid", "x".repeat(201) + "@exemple.invalid"]) {
    assert.equal(readUserAgent(bad).ok, false, String(bad));
  }
  assert.deepEqual(readUserAgent(`  ${AGENT} `), { ok: true, userAgent: AGENT });
  assert.equal(readUserAgent("Appli-Inventee contact@exemple.invalid").ok, true);
});

function memoryCache() {
  const rows = new Map<string, CacheEntry>();
  const cache: ForecastCache = {
    async get(key) { return rows.has(key) ? structuredClone(rows.get(key)!) : null; },
    async claim(key, now, until) {
      const r = rows.get(key);
      if (r && Date.parse(r.nextAllowedAt) > Date.parse(now)) return false;
      rows.set(key, { ...(r ?? { key, status: null, error: null, lastModified: null, confirmedAt: null, forecast: null }), ok: false, nextAllowedAt: until });
      return true;
    },
    async save(entry) { rows.set(entry.key, structuredClone(entry)); },
  };
  return { cache, rows };
}

type Answer = { status: number; body?: unknown; headers?: Record<string, string> } | Error;
function setup(answers: Answer[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const logs: string[] = [];
  const m = memoryCache();
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    const a = answers.shift();
    assert.ok(a, "demande de trop");
    if (a instanceof Error) throw a;
    return new Response(a.status === 304 ? null : JSON.stringify(a.body ?? sample()), { status: a.status, headers: a.headers });
  }) as unknown as typeof fetch;
  const reader = metForecastReader({ userAgent: AGENT, cache: m.cache, fetchImpl, log: (l) => logs.push(l) });
  const get = (ms = 0, network = true) => reader.get(AT, { now: later(ms), network });
  return { calls, logs, get, reader, ...m };
}
const HEADERS = { "last-modified": "Fri, 27 Nov 2026 12:00:00 GMT", expires: "Fri, 27 Nov 2026 15:50:00 GMT" };
const H = 3_600_000;

test("identification envoyée, réponse gardée, jamais de demande identique avant 3 heures", async () => {
  const s = setup([{ status: 200, headers: HEADERS }, { status: 304, headers: { expires: "Fri, 27 Nov 2026 23:00:00 GMT" } }]);
  assert.equal((await s.get(0, false)).ok, false, "sans réseau et sans réserve : rien");
  assert.equal(s.calls.length, 0);
  assert.equal((await s.get()).ok, true);
  assert.equal(s.calls[0].headers["User-Agent"], AGENT);
  assert.equal(s.calls[0].headers["If-Modified-Since"], undefined);
  // Dix appuis d'affilée, bien après l'heure « Expires » mais avant 3 heures : la réserve répond.
  for (let i = 1; i <= 10; i++) assert.equal((await s.get(i * 17 * 60_000)).ok, true);
  assert.equal((await s.get(MIN_INTERVAL_MS - 1, false)).ok, true);
  assert.equal(s.calls.length, 1);
  // Passé le délai, la réserve ne sert plus à annoncer sans nouvelle confirmation.
  assert.equal((await s.get(MIN_INTERVAL_MS, false)).ok, false);
  const again = await s.get(MIN_INTERVAL_MS + 1);
  assert.equal(again.ok && again.forecast.hours.length > 0, true);
  assert.equal(s.calls[1].headers["If-Modified-Since"], HEADERS["last-modified"]);
  // « Expires » plus lointain que 3 heures : on attend jusque-là.
  assert.equal([...s.rows.values()][0].nextAllowedAt, "2026-11-27T23:00:00.000Z");
});

test("seules les heures des trois prochains jours sont gardées", async () => {
  const s = setup([{ status: 200, headers: HEADERS }]);
  const r = await s.get();
  assert.equal(r.ok && r.forecast.hours.length, 2);
});

test("deux appuis en même temps : une seule demande", async () => {
  const s = setup([{ status: 200, headers: HEADERS }]);
  const both = await Promise.all([s.get(), s.get()]);
  assert.equal(s.calls.length, 1);
  assert.equal(both.filter((r) => r.ok).length >= 1, true);
});

test("service en panne : rien n'est annoncé, la cause est gardée, aucune nouvelle demande avant 3 heures", async () => {
  for (const failure of [new Error("coupure"), { status: 500 }, { status: 200, body: { oups: true } }] as Answer[]) {
    const s = setup([{ status: 200, headers: HEADERS }, failure, { status: 200, headers: HEADERS }]);
    await s.get();
    const down = await s.get(4 * H);
    assert.equal(down.ok, false);
    assert.equal(s.logs.length, 1);
    for (const ms of [4 * H + 1, 6 * H]) assert.equal((await s.get(ms)).ok, false, "la vieille prévision n'est pas reprise");
    assert.equal(s.calls.length, 2);
    assert.ok([...s.rows.values()][0].error);
    assert.equal((await s.get(7 * H + 1)).ok, true);
  }
});

test("429 et 403 suspendent toutes les demandes, tous points confondus ; 203 se dit", async () => {
  for (const [status, pause] of [[429, MIN_INTERVAL_MS], [403, REFUSED_PAUSE_MS]] as const) {
    const s = setup([{ status }, { status: 200, headers: HEADERS }]);
    assert.equal((await s.get()).ok, false);
    const elsewhere = await s.reader.get({ lat: 50.9, lng: 4.4 }, { now: later(60_000), network: true });
    assert.equal(elsewhere.ok, false);
    assert.equal(s.calls.length, 1);
    assert.equal(s.rows.get(PAUSE_KEY)!.nextAllowedAt, later(pause).toISOString());
    assert.equal((await s.reader.get({ lat: 50.9, lng: 4.4 }, { now: later(pause + 1), network: true })).ok, true);
  }
  const old = setup([{ status: 203, headers: HEADERS }]);
  assert.equal((await old.get()).ok, true);
  assert.match(old.logs.join(" "), /203/);
});

test("« inchangée » sans rien en réserve, ou point impossible : rien", async () => {
  const s = setup([{ status: 304 }]);
  assert.equal((await s.get()).ok, false);
  const bad = await s.reader.get({ lat: 500, lng: 0 }, { now: T0, network: true });
  assert.equal(bad.ok, false);
  assert.equal(s.calls.length, 1);
});
