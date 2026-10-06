import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./football.fixture.json";
import { BZZOIRO_ORIGIN, describeHttpError, readFootballMatches } from "./football-source";

type Call = { url: string; auth: string | null };

// Fausse API : une réponse par appel, dans l'ordre (la dernière est répétée).
// Une réponse peut être un objet JSON, un code HTTP, une erreur réseau ou un JSON invalide.
function fakeFetch(responses: (object | number | Error | "badjson")[], calls: Call[]): typeof fetch {
  let i = 0;
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    if (typeof r === "number") return { ok: false, status: r, json: async () => ({}) } as Response;
    if (r === "badjson") {
      return {
        ok: true,
        status: 200,
        json: async (): Promise<unknown> => {
          throw new SyntaxError("JSON invalide");
        },
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => r } as Response;
  }) as unknown as typeof fetch;
}

const page = (results: unknown[], next: string | null = null) => ({ count: results.length, next, previous: null, results });
const base = { apiKey: "clé-de-test", from: "2026-10-06", to: "2026-11-20" };

test("clé absente : aucune lecture, aucune requête, la cause est dite", async () => {
  const calls: Call[] = [];
  const r = await readFootballMatches({ ...base, apiKey: undefined, competitionIds: [14], fetchImpl: fakeFetch([], calls) });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
  assert.match(r.errors[0], /BZZOIRO_API_KEY absente/);
});

test("lecture d'une compétition : en-tête d'authentification, filtres de date, matchs normalisés", async () => {
  const calls: Call[] = [];
  const r = await readFootballMatches({ ...base, competitionIds: [14], fetchImpl: fakeFetch([page(fixture)], calls) });
  assert.equal(r.ok, true);
  assert.equal(r.matches.length, 10);
  assert.equal(r.perCompetition[14].count, 10);
  assert.equal(calls[0].auth, "Token clé-de-test");
  assert.match(calls[0].url, /league=14&date_from=2026-10-06&date_to=2026-11-20&limit=200/);
});

test("pagination : suit la page suivante quand elle reste chez Bzzoiro", async () => {
  const calls: Call[] = [];
  const next = `${BZZOIRO_ORIGIN}/api/events/?league=14&offset=200`;
  const r = await readFootballMatches({
    ...base,
    competitionIds: [14],
    fetchImpl: fakeFetch([page(fixture.slice(0, 4), next), page(fixture.slice(4))], calls),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, next);
  assert.equal(r.matches.length, 10);
});

test("pagination : une page suivante hors Bzzoiro n'est jamais appelée (la clé n'y part pas)", async () => {
  const calls: Call[] = [];
  const r = await readFootballMatches({
    ...base,
    competitionIds: [14],
    fetchImpl: fakeFetch([page(fixture.slice(0, 4), "https://evil.example/steal?x=1")], calls),
  });
  assert.equal(calls.length, 1);
  assert.equal(r.matches.length, 4);
});

test("pagination : plafonnée, une réponse qui boucle ne tourne pas sans fin", async () => {
  const calls: Call[] = [];
  const loop = page(fixture.slice(0, 1), `${BZZOIRO_ORIGIN}/api/events/?league=14&offset=1`);
  await readFootballMatches({ ...base, competitionIds: [14], maxPages: 3, fetchImpl: fakeFetch([loop], calls) });
  assert.equal(calls.length, 3);
});

test("clé refusée (401) : la lecture s'arrête, les autres compétitions sont marquées non lues", async () => {
  const calls: Call[] = [];
  const r = await readFootballMatches({ ...base, competitionIds: [14, 7, 8], fetchImpl: fakeFetch([401], calls) });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 1);
  assert.match(r.perCompetition[14].error!, /clé API refusée/);
  assert.match(r.perCompetition[7].error!, /non lue/);
  assert.match(r.perCompetition[8].error!, /non lue/);
});

test("limite atteinte (429) : même arrêt, dit clairement", async () => {
  const r = await readFootballMatches({ ...base, competitionIds: [14, 7], fetchImpl: fakeFetch([page(fixture.slice(0, 2)), 429], []) });
  assert.equal(r.ok, false);
  assert.equal(r.perCompetition[14].count, 2);
  assert.match(r.perCompetition[7].error!, /limite d'appels/);
});

test("panne d'une seule compétition : les autres sont gardées, ok = false", async () => {
  const r = await readFootballMatches({
    ...base,
    competitionIds: [14, 7, 8],
    fetchImpl: fakeFetch([page(fixture.slice(0, 3)), 500, page(fixture.slice(3, 5))], []),
  });
  assert.equal(r.ok, false);
  assert.equal(r.matches.length, 5);
  assert.deepEqual(r.errors, ["compétition 7 : l'API a répondu 500"]);
});

test("coupure réseau et JSON invalide : décrits, sans exception", async () => {
  const net = await readFootballMatches({ ...base, competitionIds: [14], fetchImpl: fakeFetch([new Error("ECONNRESET")], []) });
  assert.match(net.errors[0], /réseau : ECONNRESET/);
  const bad = await readFootballMatches({ ...base, competitionIds: [14], fetchImpl: fakeFetch(["badjson"], []) });
  assert.match(bad.errors[0], /JSON invalide/);
});

test("un même match lu deux fois n'est gardé qu'une fois", async () => {
  const r = await readFootballMatches({ ...base, competitionIds: [14, 64], fetchImpl: fakeFetch([page(fixture.slice(0, 3)), page(fixture.slice(1, 4))], []) });
  assert.equal(r.matches.length, 4);
});

test("describeHttpError : codes documentés par Bzzoiro", () => {
  assert.match(describeHttpError(402), /forfait payant/);
  assert.match(describeHttpError(418), /418/);
});
