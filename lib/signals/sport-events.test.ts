import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSportEventRows, selectSportEvents, type SportEventRow } from "./sport-events";

// Le calendrier est la migration elle-même : on lit ses lignes pour tester ce qui sera réellement en base.
// (une ligne = un tuple SQL ; on en extrait la date, l'importance et l'audience, sans dupliquer les données ici.)
const SQL = readFileSync(join(process.cwd(), "docs/migrations/20261006-0500-calendrier-evenements-sportifs.sql"), "utf8");
const ROW = /\('sport_event',\s*NULL,\s*'(\d{4}-\d{2}-\d{2})',\s*'(\d{4}-\d{2}-\d{2})',\s*'((?:[^']|'')*)',\s*NULL,\s*'([a-z_]+)',\s*(NULL|TIMESTAMPTZ\s*'[^']+'),\s*'\{([A-Z,]*)\}',\s*(\d),\s*(NULL|'(?:[^']|'')*'),\s*'([A-Z]{2})'\)/g;

function seedRows(): SportEventRow[] {
  const raw = [...SQL.matchAll(ROW)].map((m) => ({
    starts_on: m[1],
    ends_on: m[2],
    label: m[3].replace(/''/g, "'"),
    sport: m[4],
    starts_at: m[5] === "NULL" ? null : m[5].replace(/TIMESTAMPTZ\s*'([^']+)'/, "$1"),
    audience: m[6] ? m[6].split(",") : [],
    importance: Number(m[7]),
    city: m[8] === "NULL" ? null : m[8].slice(1, -1).replace(/''/g, "'"),
    country: m[9],
  }));
  return parseSportEventRows(raw);
}

const events = seedRows();
const find = (rx: RegExp) => events.find((e) => rx.test(e.label))!;

test("le calendrier de la migration : 19 événements bien formés, aucune ligne perdue par l'analyse", () => {
  const inserted = (SQL.match(/\('sport_event',/g) ?? []).length;
  assert.equal(inserted, 19);
  assert.equal(events.length, 19, "une ligne du SQL n'a pas pu être lue : format, date ou importance invalides");
  assert.ok(events.every((e) => e.starts_on <= e.ends_on));
});

test("le calendrier : les heures précises sont celles des trois finales UEFA, en UTC", () => {
  const withTime = events.filter((e) => e.starts_at);
  assert.deepEqual(withTime.map((e) => e.label.split(",")[0]).sort(), [
    "Finale de la Ligue Conférence",
    "Finale de la Ligue Europa",
    "Finale de la Ligue des champions",
  ]);
});

test("le calendrier : pas de boxe, pas de GP de Belgique, pas de grève (non vérifiés)", () => {
  assert.ok(!events.some((e) => /boxe|grand prix|gp de belgique|gr[eè]ve/i.test(e.label)));
});

test("parseSportEventRows : ignore ce qui est mal formé", () => {
  assert.deepEqual(parseSportEventRows(null), []);
  const bad = [
    null,
    { label: "x" },
    { starts_on: "2026-10-16", ends_on: "2026-10-15", label: "fin avant début", sport: "combat", importance: 1 },
    { starts_on: "2026-10-16", ends_on: "2026-10-16", label: "importance 9", sport: "combat", importance: 9 },
    { starts_on: "2026-10-16", ends_on: "2026-10-16", label: "", sport: "combat", importance: 1 },
  ];
  assert.deepEqual(parseSportEventRows(bad), []);
  const ok = parseSportEventRows([{ starts_on: "2026-10-16T00:00:00Z", ends_on: "2026-10-16", label: "ok", sport: "combat", importance: 1, audience: ["be"], starts_at: "2026-10-16T18:00:00+00:00" }]);
  assert.equal(ok[0].starts_on, "2026-10-16");
  assert.deepEqual(ok[0].audience, ["BE"]);
  assert.equal(ok[0].starts_at, "2026-10-16T18:00:00.000Z");
});

test("sélection : le GLORY d'Anvers concerne une clientèle belge, pas une clientèle seulement marocaine", () => {
  const input = { events, today: "2026-10-10", horizonDays: 10 };
  const be = selectSportEvents({ ...input, audiences: ["BE"] });
  assert.ok(be.some((o) => /GLORY 110/.test(o.event.label)));
  const ma = selectSportEvents({ ...input, audiences: ["MA"] });
  assert.ok(!ma.some((o) => /GLORY 110/.test(o.event.label)));
  // Un événement ouvert à tous (PFL Chicago) est proposé aux deux.
  assert.ok(be.some((o) => /PFL Chicago/.test(o.event.label)) && ma.some((o) => /PFL Chicago/.test(o.event.label)));
  assert.equal(ma.find((o) => /PFL Chicago/.test(o.event.label))!.matchedAudience, "tous");
  assert.deepEqual(be.find((o) => /GLORY 110/.test(o.event.label))!.matchedAudience, ["BE"]);
});

test("sélection : la CAN 2027 parle à une clientèle marocaine, pas à une clientèle seulement belge", () => {
  const input = { events, today: "2027-06-18", horizonDays: 3 };
  assert.ok(selectSportEvents({ ...input, audiences: ["MA"] }).some((o) => /Coupe d'Afrique/.test(o.event.label)));
  assert.ok(!selectSportEvents({ ...input, audiences: ["BE"] }).some((o) => /Coupe d'Afrique/.test(o.event.label)));
});

test("sélection : un événement de plusieurs jours est en cours pendant toute sa durée", () => {
  const during = selectSportEvents({ events, today: "2027-07-10", audiences: ["BE"], horizonDays: 0 });
  const tour = during.find((o) => /Tour de France/.test(o.event.label))!;
  assert.equal(tour.activeToday, true);
  assert.equal(tour.multiDay, true);
  assert.equal(tour.startsInDays, 0);
  // La veille du départ : pas en cours, à 1 jour.
  const eve = selectSportEvents({ events, today: "2027-07-01", audiences: ["BE"], horizonDays: 3 }).find((o) => /Tour de France/.test(o.event.label))!;
  assert.equal(eve.activeToday, false);
  assert.equal(eve.startsInDays, 1);
  // Le lendemain de l'arrivée : fini.
  assert.ok(!selectSportEvents({ events, today: "2027-07-26", audiences: ["BE"] }).some((o) => /Tour de France/.test(o.event.label)));
});

test("sélection : heure de Bruxelles d'une finale (heure d'été), et dates inclusives", () => {
  const ldc = selectSportEvents({ events, today: "2027-06-05", audiences: [], horizonDays: 0 }).find((o) => /Ligue des champions/.test(o.event.label))!;
  assert.deepEqual(ldc.kickoffBrussels, { date: "2027-06-05", time: "18:00", hour: 18, weekday: 6 });
  assert.equal(ldc.activeToday, true);
  assert.ok(!selectSportEvents({ events, today: "2027-06-06", audiences: [] }).some((o) => /Ligue des champions/.test(o.event.label)));
  // Sans heure connue : pas d'heure inventée.
  const sb = selectSportEvents({ events, today: "2027-02-14", audiences: [], horizonDays: 0 }).find((o) => /Super Bowl/.test(o.event.label))!;
  assert.equal(sb.kickoffBrussels, null);
});

test("sélection : importance minimale, sports retenus, tri (en cours d'abord, puis le plus important)", () => {
  const all = selectSportEvents({ events, today: "2026-12-10", audiences: ["BE", "NL"], horizonDays: 10 });
  assert.ok(all.length >= 3);
  const big = selectSportEvents({ events, today: "2026-12-10", audiences: ["BE", "NL"], horizonDays: 10, minImportance: 2 });
  assert.ok(big.every((o) => o.event.importance >= 2));
  assert.ok(big.length < all.length);
  assert.deepEqual(selectSportEvents({ events, today: "2026-12-10", audiences: ["BE"], horizonDays: 10, sports: ["cyclisme"] }), []);
  // Le 12/12 : deux soirées le même jour, la plus importante (GLORY Collision, 2) avant ONE (1).
  const day = selectSportEvents({ events, today: "2026-12-12", audiences: ["BE", "NL"], horizonDays: 0 });
  assert.match(day[0].event.label, /GLORY Collision 10/);
  assert.match(day[1].event.label, /ONE Fight Night 50/);
});

test("sélection : sans communauté renseignée, seuls les événements ouverts à tous sont proposés", () => {
  const out = selectSportEvents({ events, today: "2026-10-10", audiences: [], horizonDays: 10 });
  assert.ok(out.length > 0);
  assert.ok(out.every((o) => o.matchedAudience === "tous"));
});

test("sélection : hors fenêtre, rien", () => {
  assert.deepEqual(selectSportEvents({ events, today: "2026-10-01", audiences: ["BE"], horizonDays: 3 }), []);
});
