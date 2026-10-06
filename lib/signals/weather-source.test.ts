import { test } from "node:test";
import assert from "node:assert/strict";
import forecastFixture from "./weather-forecast.fixture.json";
import archiveFixture from "./weather-archive.fixture.json";
import { USER_AGENT } from "./transport-source";
import { archiveUrl, forecastUrl, readArchive, readForecast } from "./weather-source";

type Reply = { status: number; body: unknown } | Error | "badjson";

function fakeFetch(reply: Reply, calls: { url: string; userAgent: string | null }[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, userAgent: new Headers(init?.headers).get("user-agent") });
    if (reply instanceof Error) throw reply;
    if (reply === "badjson") {
      return {
        ok: true,
        status: 200,
        json: async (): Promise<unknown> => {
          throw new SyntaxError("JSON invalide");
        },
      } as unknown as Response;
    }
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body } as unknown as Response;
  }) as unknown as typeof fetch;
}

const kraainem = { latitude: 50.8613, longitude: 4.4667 };

test("URL de prévision : heure de Bruxelles, best_match, colonnes nommées", () => {
  const u = new URL(forecastUrl(kraainem));
  assert.equal(u.origin + u.pathname, "https://api.open-meteo.com/v1/forecast");
  assert.equal(u.searchParams.get("timezone"), "Europe/Brussels");
  assert.equal(u.searchParams.get("models"), "best_match");
  assert.equal(u.searchParams.get("forecast_days"), "7");
  assert.ok(u.searchParams.get("hourly")!.split(",").includes("precipitation_probability"));
});

test("URL d'archive : sans modèle imposé (era5_land rend la pluie vide), sans probabilité", () => {
  const u = new URL(archiveUrl(kraainem, "2026-09-28", "2026-10-04"));
  assert.equal(u.origin + u.pathname, "https://archive-api.open-meteo.com/v1/archive");
  assert.equal(u.searchParams.get("models"), null);
  assert.equal(u.searchParams.get("start_date"), "2026-09-28");
  assert.equal(u.searchParams.get("end_date"), "2026-10-04");
  assert.ok(!u.searchParams.get("hourly")!.includes("precipitation_probability"));
});

test("prévision lue : modèle, réponse brute et heures manquantes dans le résultat", async () => {
  const calls: { url: string; userAgent: string | null }[] = [];
  const r = await readForecast(kraainem, { fetchImpl: fakeFetch({ status: 200, body: forecastFixture }, calls) });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.model, "best_match");
  assert.equal(r.read.hours.length, 168);
  assert.equal(r.missingHours, 0);
  assert.equal(r.raw, forecastFixture);
  assert.equal(calls[0].userAgent, USER_AGENT);
});

test("archive lue", async () => {
  const r = await readArchive(kraainem, "2026-09-28", "2026-10-04", {
    fetchImpl: fakeFetch({ status: 200, body: archiveFixture }),
  });
  assert.equal(r.ok && r.kind, "archive");
});

test("refus d'Open-Meteo : sa raison est gardée", async () => {
  const r = await readForecast(kraainem, {
    fetchImpl: fakeFetch({ status: 400, body: { error: true, reason: "Cannot initialize WeatherVariable" } }),
  });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /400 : Cannot initialize/);
});

test("429 : la cause dit de garder en cache", async () => {
  const r = await readForecast(kraainem, { fetchImpl: fakeFetch({ status: 429, body: {} }) });
  assert.match(!r.ok ? r.error : "", /429.*cache/);
});

test("réseau coupé, JSON illisible, forme inattendue : trois causes distinctes", async () => {
  const net = await readForecast(kraainem, { fetchImpl: fakeFetch(new Error("ECONNRESET")) });
  const bad = await readForecast(kraainem, { fetchImpl: fakeFetch("badjson") });
  const shape = await readForecast(kraainem, { fetchImpl: fakeFetch({ status: 200, body: { hourly: {} } }) });
  assert.deepEqual(
    [net, bad, shape].map((r) => (!r.ok ? r.error : "")),
    ["réseau : ECONNRESET", "réponse illisible (JSON invalide)", "format de réponse inattendu"]
  );
});

test("coordonnées invalides : aucun appel", async () => {
  const calls: { url: string; userAgent: string | null }[] = [];
  const r = await readForecast({ latitude: 500, longitude: 4 }, { fetchImpl: fakeFetch({ status: 200, body: {} }, calls) });
  assert.equal(!r.ok && r.error, "coordonnées invalides");
  assert.equal(calls.length, 0);
});
