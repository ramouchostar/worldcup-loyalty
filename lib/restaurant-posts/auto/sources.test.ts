import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBzzoiroEvents, type FootballMatch } from "../../signals/football";
import { agendaRow, HERE } from "./testing";
import { eventCandidates, eventSource } from "./sources/events";
import { matchCandidates, matchSource } from "./sources/matches";

const DAY = "2026-11-28";
const NOW = new Date("2026-11-27T16:00:00Z");
const WINDOW = { from: DAY, to: "2026-11-30" };
const ctx = { restaurantId: "r", coords: HERE, now: NOW, network: false };
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
  assert.match((await none.unavailable())!, /BZZOIRO_API_KEY/);
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

