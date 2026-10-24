import { test } from "node:test";
import assert from "node:assert/strict";
import forecastPages from "./weather-google-forecast.fixture.json";
import historyPage from "./weather-google-history.fixture.json";
import { googleWeatherUrl, readGoogleForecast, readGoogleHistory } from "./weather-google-source";

type Call = { url: string; apiKey: string | null };
type Reply = { status: number; body: unknown } | Error;

// Fausse API : sert les réponses dans l'ordre, une par appel.
function fakeFetch(replies: Reply[], calls: Call[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, apiKey: new Headers(init?.headers).get("x-goog-api-key") });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as unknown as Response;
  }) as unknown as typeof fetch;
}

const kraainem = { latitude: 50.8490066, longitude: 4.4588551 };
const apiKey = "cle-de-test";
const ok = (body: unknown) => ({ status: 200, body });

test("prévisions : suit les 7 pages (24 h chacune), clé en en-tête, jamais dans l'URL", async () => {
  const calls: Call[] = [];
  const r = await readGoogleForecast(kraainem, {
    apiKey,
    fetchImpl: fakeFetch((forecastPages as unknown[]).map(ok), calls),
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.pages, 7);
  assert.equal(r.read.hours.length, 168);
  assert.equal(r.missingHours, 0);
  assert.equal(r.model, "google_weather");
  assert.equal(calls.length, 7);
  assert.ok(calls.every((c) => c.apiKey === apiKey && !c.url.includes(apiKey) && !c.url.includes("key=")));
  assert.equal(new URL(calls[0].url).searchParams.get("pageToken"), null);
  assert.equal(new URL(calls[1].url).searchParams.get("pageToken"), "page-2");
});

test("URL : 168 heures demandées, 24 par page", () => {
  const u = new URL(googleWeatherUrl("forecast", kraainem, 168));
  assert.equal(u.origin + u.pathname, "https://weather.googleapis.com/v1/forecast/hours:lookup");
  assert.equal(u.searchParams.get("hours"), "168");
  assert.equal(u.searchParams.get("pageSize"), "24");
  assert.equal(u.searchParams.get("location.latitude"), "50.8490");
});

test("historique : une page, 24 heures", async () => {
  const r = await readGoogleHistory(kraainem, { apiKey, fetchImpl: fakeFetch([ok(historyPage)]) });
  assert.equal(r.ok && r.read.hours.length, 24);
  assert.equal(r.ok && r.kind, "history");
});

test("une page qui échoue en cours de route : échec, avec le nombre de pages déjà lues", async () => {
  const pages = (forecastPages as unknown[]).slice(0, 2).map(ok);
  const r = await readGoogleForecast(kraainem, {
    apiKey,
    fetchImpl: fakeFetch([...pages, { status: 429, body: { error: { message: "quota" } } }]),
  });
  assert.equal(r.ok, false);
  assert.equal(r.pages, 2);
  assert.match(!r.ok ? r.error : "", /429.*cache/);
});

test("403 : la cause dit API non activée ou clé restreinte, avec le message de Google", async () => {
  const r = await readGoogleForecast(kraainem, {
    apiKey,
    fetchImpl: fakeFetch([{ status: 403, body: { error: { message: "Weather API has not been used" } } }]),
  });
  assert.match(!r.ok ? r.error : "", /403.*non activée.*has not been used/);
});

test("sans clé, coordonnées invalides : aucun appel", async () => {
  const calls: Call[] = [];
  const saved = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  try {
    const noKey = await readGoogleForecast(kraainem, { fetchImpl: fakeFetch([ok({})], calls) });
    const badCoords = await readGoogleForecast({ latitude: 500, longitude: 4 }, { apiKey, fetchImpl: fakeFetch([ok({})], calls) });
    assert.equal(!noKey.ok && noKey.error, "clé GOOGLE_PLACES_API_KEY absente");
    assert.equal(!badCoords.ok && badCoords.error, "coordonnées invalides");
    assert.equal(calls.length, 0);
  } finally {
    if (saved !== undefined) process.env.GOOGLE_PLACES_API_KEY = saved;
  }
});

test("pagination qui ne finit jamais : arrêt à 10 pages", async () => {
  const calls: Call[] = [];
  const page = { ...(forecastPages as { nextPageToken?: string }[])[0], nextPageToken: "encore" };
  const r = await readGoogleForecast(kraainem, { apiKey, fetchImpl: fakeFetch([ok(page)], calls) });
  assert.equal(calls.length, 10);
  assert.equal(r.pages, 10);
});
