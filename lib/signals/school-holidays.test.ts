import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./school-holidays.fixture.json";
import {
  addDays,
  parseOpenHolidays,
  planSchoolHolidaySync,
  toSyncRows,
  type ExistingRow,
} from "./school-holidays";

// Réponse réelle d'OpenHolidays (BE, 2026-04-01 → 2027-09-30), lue le 2026-10-06.
const api = parseOpenHolidays(fixture);
const TODAY = "2026-10-06";
const WINDOW_FROM = addDays(TODAY, -200);

// Une partie du seed m46 tel qu'il est en base (source « manuel »).
const manual = (id: string, community: string, starts_on: string, ends_on: string): ExistingRow => ({
  id, source: "manuel", external_id: null, community, starts_on, ends_on,
});
const SEED: ExistingRow[] = [
  manual("fr-toussaint", "FR", "2026-10-19", "2026-10-30"),
  manual("nl-toussaint", "NL", "2026-10-26", "2026-11-01"), // erreur du seed : l'API dit 02/11 → 08/11
  manual("fr-ete-27", "FR", "2027-07-03", "2027-08-29"),     // l'API n'a que le repère de début
  manual("de-herbst", "DE", "2026-11-02", "2026-11-06"),     // l'API n'a plus rien pour DE après l'été 2026
  manual("de-noel", "DE", "2026-12-21", "2027-01-01"),
  manual("de-ete-26", "DE", "2026-07-01", "2026-08-31"),
];

test("parseOpenHolidays : ne garde que les entrées bien formées", () => {
  assert.equal(api.length, 16);
  assert.deepEqual(parseOpenHolidays(null), []);
  assert.deepEqual(parseOpenHolidays({ detail: "The maximum date range is 1095 days." }), []);
  assert.deepEqual(parseOpenHolidays([{ id: 1 }, null, "x", { id: "a", startDate: "2026-02-30x", endDate: "2026-03-01" }]), []);
  // début après fin : rejeté
  assert.deepEqual(parseOpenHolidays([{ id: "a", startDate: "2026-03-02", endDate: "2026-03-01", name: [], groups: [] }]), []);
});

test("toSyncRows : groupes BE-FR/NL/DE → FR/NL/DE, un jour seul ignoré", () => {
  const { rows, skipped, coveredThrough } = toSyncRows(api);
  assert.ok(rows.every((r) => ["FR", "NL", "DE"].includes(r.community)));
  assert.ok(rows.every((r) => r.starts_on < r.ends_on));
  // « Début des vacances d'été » (FR, 2027-07-03, un seul jour) n'est pas une période.
  assert.equal(skipped.singleDay >= 1, true);
  assert.equal(rows.some((r) => r.community === "FR" && r.starts_on === "2027-07-03"), false);
  assert.equal(coveredThrough.FR, "2027-05-09");
  assert.equal(coveredThrough.NL, "2027-08-31");
  assert.equal(coveredThrough.DE, "2026-08-31");
});

test("toSyncRows : identifiant externe = id + communauté, libellé avec la région", () => {
  const { rows } = toSyncRows(api);
  const carnavalFR = rows.find((r) => r.community === "FR" && r.starts_on === "2027-02-22");
  assert.ok(carnavalFR);
  assert.match(carnavalFR!.external_id, /^[0-9a-f-]{36}:FR$/);
  assert.equal(carnavalFR!.label, "Congé de détente (Carnaval) (FWB)");
});

test("plan : la Toussaint flamande du seed (erreur) est remplacée par celle de l'API", () => {
  const plan = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: SEED });
  const removed = plan.removeManual.find((r) => r.id === "nl-toussaint");
  assert.ok(removed);
  assert.match(removed!.reason, /2026-11-02 → 2026-11-08/);
  assert.ok(plan.upserts.some((r) => r.community === "NL" && r.starts_on === "2026-11-02" && r.ends_on === "2026-11-08"));
});

test("plan : une ligne manuelle que l'API redécrit est remplacée (Toussaint FR)", () => {
  const plan = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: SEED });
  assert.ok(plan.removeManual.some((r) => r.id === "fr-toussaint"));
});

test("plan : là où l'API ne dit rien, la ligne manuelle reste (été FR 2027, DE après l'été 2026)", () => {
  const plan = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: SEED });
  const removed = new Set([...plan.removeManual, ...plan.removeStale].map((r) => r.id));
  for (const keep of ["fr-ete-27", "de-herbst", "de-noel"]) assert.equal(removed.has(keep), false, keep);
});

test("plan : les trous sont comptés — FR et DE n'atteignent pas l'horizon, NL oui", () => {
  // Horizon de 300 jours : la fixture s'arrête à fin septembre 2027 (en vrai l'API va jusqu'en 2028 pour NL).
  const plan = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: SEED, horizonDays: 300 });
  assert.deepEqual(plan.shortCommunities, ["FR", "DE"]);
  assert.equal(plan.gaps, plan.shortCommunities.length + plan.orphanManual.length);
});

test("plan : une ligne manuelle dans la zone couverte mais sans équivalent est gardée et signalée", () => {
  const orphan = manual("nl-bizarre", "NL", "2027-06-01", "2027-06-05"); // aucune période NL proche en juin 2027
  const plan = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: [orphan] });
  assert.equal(plan.removeManual.length, 0);
  assert.deepEqual(plan.orphanManual.map((r) => r.id), ["nl-bizarre"]);
});

test("plan : rejouer la synchro ne retire rien et ne duplique rien", () => {
  const first = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: [] });
  const asRows: ExistingRow[] = first.upserts.map((r, i) => ({
    id: `db-${i}`, source: "openholidays", external_id: r.external_id, community: r.community, starts_on: r.starts_on, ends_on: r.ends_on,
  }));
  const second = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: asRows });
  assert.equal(second.removeStale.length, 0);
  assert.equal(second.removeManual.length, 0);
  assert.deepEqual(second.upserts, first.upserts); // même clé externe → l'upsert met à jour, pas de doublon
});

test("plan : une période que l'API ne fournit plus est retirée, mais pas avant la fenêtre", () => {
  const gone: ExistingRow = { id: "old", source: "openholidays", external_id: "disparu:FR", community: "FR", starts_on: "2027-03-01", ends_on: "2027-03-05" };
  const ancient: ExistingRow = { id: "ancient", source: "openholidays", external_id: "vieux:FR", community: "FR", starts_on: "2026-01-05", ends_on: "2026-01-09" };
  const plan = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: [gone, ancient] });
  assert.deepEqual(plan.removeStale.map((r) => r.id), ["old"]);
});

test("plan : les lignes manuelles antérieures à la fenêtre ne sont jamais touchées", () => {
  const past = manual("fr-carnaval-26", "FR", "2026-02-16", "2026-02-27");
  const plan = planSchoolHolidaySync({ today: TODAY, windowFrom: WINDOW_FROM, api, existing: [past] });
  assert.equal(plan.removeManual.length + plan.orphanManual.length, 0);
});

test("addDays : franchit les mois et les années", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-10-06", -200), "2026-03-20");
});
