import { test } from "node:test";
import assert from "node:assert/strict";
import irailFixture from "./transport-irail.fixture.json";
import stibFixture from "./transport-stib.fixture.json";
import { IRAIL_URL, STIB_URL, USER_AGENT, describeHttpError, readTransportNotices } from "./transport-source";

type Call = { url: string; userAgent: string | null };
type Reply = object | number | Error | "badjson";

// Fausse API : une réponse par URL.
function fakeFetch(replies: { irail: Reply; stib: Reply }, calls: Call[]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, userAgent: new Headers(init?.headers).get("user-agent") });
    const r = url.startsWith("https://api.irail.be") ? replies.irail : replies.stib;
    if (r instanceof Error) throw r;
    if (typeof r === "number") return { ok: false, status: r, json: async () => ({}) } as unknown as Response;
    if (r === "badjson") {
      return {
        ok: true,
        status: 200,
        json: async (): Promise<unknown> => {
          throw new SyntaxError("JSON invalide");
        },
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => r } as unknown as Response;
  }) as unknown as typeof fetch;
}

const today = "2026-10-06";

test("deux sources lues : 5 avis iRail + 12 avis STIB, adresse de contact de la plateforme", async () => {
  const calls: Call[] = [];
  const r = await readTransportNotices({ today, fetchImpl: fakeFetch({ irail: irailFixture, stib: stibFixture }, calls) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.perSource, { irail: { count: 5 }, stib: { count: 12 } });
  assert.equal(r.notices.length, 17);
  assert.deepEqual(calls.map((c) => c.url), [IRAIL_URL, STIB_URL]);
  assert.ok(calls.every((c) => c.userAgent === USER_AGENT));
  assert.match(USER_AGENT, /contact@boosteats\.be/);
});

test("STIB au plafond quotidien (429) : iRail est gardé, la cause dit de mettre en cache", async () => {
  const r = await readTransportNotices({ today, fetchImpl: fakeFetch({ irail: irailFixture, stib: 429 }, []) });
  assert.equal(r.ok, false);
  assert.equal(r.perSource.irail.count, 5);
  assert.match(r.perSource.stib.error!, /100 lectures par jour.*cache/);
  assert.equal(r.notices.length, 5);
});

test("iRail en panne (500) : STIB est gardé", async () => {
  const r = await readTransportNotices({ today, fetchImpl: fakeFetch({ irail: 500, stib: stibFixture }, []) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ["irail : iRail a répondu 500"]);
  assert.equal(r.notices.length, 12);
});

test("coupure réseau et JSON invalide : décrits, sans exception", async () => {
  const r = await readTransportNotices({ today, fetchImpl: fakeFetch({ irail: new Error("ECONNRESET"), stib: "badjson" }, []) });
  assert.equal(r.ok, false);
  assert.match(r.perSource.irail.error!, /réseau : ECONNRESET/);
  assert.match(r.perSource.stib.error!, /JSON invalide/);
  assert.equal(r.notices.length, 0);
});

test("format qui change : dit « inattendu » au lieu de laisser croire à « aucun avis »", async () => {
  const r = await readTransportNotices({ today, fetchImpl: fakeFetch({ irail: { version: "2.0", avis: [] }, stib: { data: [] } }, []) });
  assert.equal(r.ok, false);
  assert.match(r.perSource.irail.error!, /format de réponse inattendu/);
  assert.match(r.perSource.stib.error!, /format de réponse inattendu/);
});

test("liste vide mais bien formée : ok, zéro avis (ce n'est pas une panne)", async () => {
  const r = await readTransportNotices({ today, fetchImpl: fakeFetch({ irail: { disturbance: [] }, stib: { results: [] } }, []) });
  assert.equal(r.ok, true);
  assert.equal(r.notices.length, 0);
});

test("describeHttpError : limites documentées de chaque source", () => {
  assert.match(describeHttpError("stib", 429), /100 lectures par jour/);
  assert.match(describeHttpError("irail", 429), /3 requêtes par seconde/);
  assert.match(describeHttpError("stib", 503), /STIB a répondu 503/);
});
