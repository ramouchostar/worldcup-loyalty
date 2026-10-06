import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./local-events-visitbrussels.fixture.json";
import { AGENDA_URL, PAGE_SIZE, USER_AGENT, describeHttpError, readVisitBrusselsAgenda } from "./local-events-source";

type Call = { url: string; userAgent: string | null };
type Reply = object | number | Error | "badjson";

// Fausse API : une réponse par appel, dans l'ordre (la dernière est répétée).
function fakeFetch(replies: Reply[], calls: Call[]): typeof fetch {
  let i = 0;
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, userAgent: new Headers(init?.headers).get("user-agent") });
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r instanceof Error) throw r;
    if (typeof r === "number") return { ok: false, status: r, text: async () => "{}" } as unknown as Response;
    if (r === "badjson") return { ok: true, status: 200, text: async () => "<html>pas du json" } as unknown as Response;
    return { ok: true, status: 200, text: async () => JSON.stringify(r) } as unknown as Response;
  }) as unknown as typeof fetch;
}

const half = Math.ceil(fixture.data.length / 2);
const page = (data: unknown[], totalPages: number) => ({ data, results: fixture.data.length, totalPages, queryTime: 8 });
const window = { from: "2026-10-06", to: "2026-11-15" };

test("deux pages lues : seules les occurrences utiles sont gardées, contact de la plateforme dans l'en-tête", async () => {
  const calls: Call[] = [];
  const r = await readVisitBrusselsAgenda({
    ...window,
    fetchImpl: fakeFetch([page(fixture.data.slice(0, half), 2), page(fixture.data.slice(half), 2)], calls),
  });
  assert.equal(r.ok, true);
  assert.equal(r.pagesRead, 2);
  assert.equal(r.pagesTotal, 2);
  assert.equal(r.eventsSeen, fixture.data.length);
  assert.ok(r.occurrencesInWindow > r.events.length, "le tri doit écarter des occurrences");
  assert.ok(r.events.some((e) => /PATRICK BRUEL/.test(e.name)));
  assert.ok(!r.events.some((e) => /Atelier Internet utile/.test(e.name)));
  assert.deepEqual(calls.map((c) => c.url), [`${AGENDA_URL}?size=${PAGE_SIZE}&page=1`, `${AGENDA_URL}?size=${PAGE_SIZE}&page=2`]);
  assert.ok(calls.every((c) => c.userAgent === USER_AGENT));
  assert.match(USER_AGENT, /contact@boosteats\.be/);
  assert.equal(new Set(r.events.map((e) => e.externalId)).size, r.events.length);
});

test("une page en panne : les autres sont gardées, ok = false, la page est nommée", async () => {
  const r = await readVisitBrusselsAgenda({
    ...window,
    fetchImpl: fakeFetch([page(fixture.data.slice(0, half), 3), 500, page(fixture.data.slice(half), 3)], []),
  });
  assert.equal(r.ok, false);
  assert.equal(r.pagesRead, 2);
  assert.deepEqual(r.errors, ["page 2 : l'agenda a répondu 500"]);
  assert.ok(r.events.length > 0);
});

test("limite atteinte (429) : la lecture s'arrête tout de suite", async () => {
  const calls: Call[] = [];
  const r = await readVisitBrusselsAgenda({ ...window, fetchImpl: fakeFetch([page(fixture.data, 5), 429], calls) });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 2); // pages 3 à 5 jamais demandées
  assert.match(r.errors[0], /429/);
});

test("coupure réseau, JSON invalide, format inattendu : décrits, sans exception", async () => {
  const net = await readVisitBrusselsAgenda({ ...window, maxPages: 1, fetchImpl: fakeFetch([new Error("ECONNRESET")], []) });
  assert.match(net.errors[0], /réseau : ECONNRESET/);
  const bad = await readVisitBrusselsAgenda({ ...window, maxPages: 1, fetchImpl: fakeFetch(["badjson"], []) });
  assert.match(bad.errors[0], /JSON invalide/);
  const shape = await readVisitBrusselsAgenda({ ...window, maxPages: 1, fetchImpl: fakeFetch([{ events: [] }], []) });
  assert.match(shape.errors[0], /format de réponse inattendu/);
  assert.equal(net.ok || bad.ok || shape.ok, false);
});

test("nombre de pages inconnu : lecture dite non vérifiable, jamais « complète »", async () => {
  const r = await readVisitBrusselsAgenda({ ...window, maxPages: 1, fetchImpl: fakeFetch([{ data: fixture.data.slice(0, 3) }], []) });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /non vérifiable/);
});

test("plafond de pages : une API qui annonce trop de pages ne tourne pas sans fin", async () => {
  const calls: Call[] = [];
  await readVisitBrusselsAgenda({ ...window, maxPages: 3, fetchImpl: fakeFetch([page(fixture.data.slice(0, 2), 999)], calls) });
  assert.equal(calls.length, 3);
});

test("describeHttpError : codes courants", () => {
  assert.match(describeHttpError(429), /ne pas insister/);
  assert.match(describeHttpError(503), /503/);
});
