import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlaceOrderingInfo } from "../audit/places";
import type { FicheRead } from "./fiche";
import { opennessDetail, serviceDay, type Openness } from "./hours";
import { closedByRestaurant, dayToClose, decideForOrder, decideHours, needsGoogleForOrder } from "./hours-source";
import { NO_SETTINGS, type PageSettings } from "./page-settings";
import type { Service, WeeklyHours } from "./weekly-hours";

// Jeudi 26 novembre 2026, midi à Bruxelles (UTC+1).
const NOON = new Date("2026-11-26T11:00:00Z");
const at = (iso: string) => new Date(`${iso}+01:00`);

const s = (open: string, close: string): Service => ({ open, close });
const every = (...services: Service[]): WeeklyHours => Array.from({ length: 7 }, () => services);
const MINE = every(s("18:00", "22:00"));

const info = (extra: Partial<PlaceOrderingInfo> = {}): PlaceOrderingInfo => ({
  rating: 4, reviewsCount: 12, businessStatus: "OPERATIONAL", currentOpeningHours: null,
  regularOpeningHours: { periods: [{ open: { day: 0 } }] }, attributions: [], ...extra,
});
const OPEN: FicheRead = { ok: true, info: info() };
const CLOSED: FicheRead = { ok: true, info: info({ businessStatus: "CLOSED_TEMPORARILY" }) };
const SILENT: FicheRead = { ok: true, info: info({ regularOpeningHours: null }) };
const DOWN: FicheRead = { ok: false, cause: "lecture_impossible" };
const NOTHING: FicheRead = { ok: false, cause: "pas_de_fiche" };

const settings = (extra: Partial<PageSettings> = {}): PageSettings => ({ ...NO_SETTINGS, ...extra });
const never = async (): Promise<FicheRead> => { throw new Error("Google ne devait pas être appelé"); };
const state = (o: Openness) => o.state;

test("rien de réglé : Google décide, comme avant", () => {
  const d = decideHours(settings(), OPEN, NOON);
  assert.deepEqual([state(d.openness), d.origin, d.hoursFromGoogle], ["ouvert", "google", true]);
  assert.equal(decideHours(settings({ activated: false }), SILENT, NOON).openness.state, "inconnu");
});

test("une fermeture saisie passe avant tout : devant Google ouvert comme devant ses propres horaires", () => {
  for (const extra of [{ closedToday: "2026-11-26" }, { closures: [{ from: "2026-11-25", to: "2026-11-27" }] }]) {
    for (const source of ["google", "manual"] as const) {
      const d = decideHours(settings({ ...extra, source, weekly: every(s("11:00", "22:00")) }), OPEN, NOON);
      assert.deepEqual([state(d.openness), d.origin], ["ferme", "fermeture"], `${source} ${JSON.stringify(extra)}`);
    }
  }
});

test("« Les miens » : ses horaires, quoi que dise Google", () => {
  const mine = settings({ source: "manual", weekly: MINE });
  for (const read of [OPEN, CLOSED, SILENT, DOWN, NOTHING, null]) {
    const d = decideHours(mine, read, NOON);
    assert.deepEqual([state(d.openness), d.origin, d.hoursFromGoogle], ["ferme", "saisi", false]);
    assert.equal(opennessDetail(d.openness, NOON), "ouvre à 18:00");
  }
  assert.equal(decideHours(mine, DOWN, at("2026-11-26T19:00:00")).openness.state, "ouvert");
});

test("une fiche qui dit « fermé » n'est pas un silence : les horaires saisis ne la contredisent pas", () => {
  const d = decideHours(settings({ weekly: every(s("11:00", "22:00")) }), CLOSED, NOON);
  assert.deepEqual([state(d.openness), d.origin], ["ferme", "google"]);
});

test("Google muet ou en panne : les horaires saisis servent de repli", () => {
  for (const read of [SILENT, DOWN, NOTHING]) {
    const d = decideHours(settings({ weekly: every(s("11:00", "22:00")) }), read, NOON);
    assert.deepEqual([state(d.openness), d.origin, d.hoursFromGoogle], ["ouvert", "repli", false]);
  }
});

test("ni Google ni saisie : inconnu, et la cause est dite", () => {
  assert.deepEqual([SILENT, DOWN, NOTHING].map((r) => decideHours(settings(), r, NOON).cause), ["sans_horaires", "lecture_impossible", "pas_de_fiche"]);
  assert.equal(decideHours(settings(), SILENT, NOON).origin, "aucune");
});

test("« Les miens » sans semaine lisible : Google reprend la main", () => {
  assert.equal(decideHours(settings({ source: "manual" }), OPEN, NOON).origin, "google");
});

test("à l'envoi, Google n'est pas appelé avec ses propres horaires ni pendant une fermeture saisie", async () => {
  const mine = settings({ source: "manual", weekly: every(s("11:00", "22:00")) });
  assert.equal((await decideForOrder(mine, never, NOON)).openness.state, "ouvert");
  const closed = settings({ closedToday: "2026-11-26" });
  assert.equal((await decideForOrder(closed, never, NOON)).openness.state, "ferme");
  assert.equal(needsGoogleForOrder(settings({ weekly: MINE }), NOON), true); // « Ceux de Google » : il faut la lire
  await assert.rejects(decideForOrder(settings(), never, NOON));
});

test("la mention Google n'accompagne que ce qui vient de Google", () => {
  // Fermé par le restaurant, réouverture lue sur la fiche : l'heure vient de Google.
  const reopening: FicheRead = { ok: true, info: info({ regularOpeningHours: { periods: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 11 }, close: { day, hour: 22 } })) } }) };
  const d = decideHours(settings({ closedToday: "2026-11-26" }), reopening, NOON);
  assert.equal(d.hoursFromGoogle, true);
  assert.equal(opennessDetail(d.openness, NOON), "ouvre demain à 11:00");
  // La même fermeture avec ses propres horaires : rien de Google.
  assert.equal(decideHours(settings({ closedToday: "2026-11-26", source: "manual", weekly: MINE }), reopening, NOON).hoursFromGoogle, false);
  assert.equal(decideHours(settings({ closedToday: "2026-11-26" }), null, NOON).hoursFromGoogle, false);
});

test("deux services et passage de minuit, à l'heure de Bruxelles", () => {
  const week = every(s("11:00", "14:00"), s("18:00", "02:00"));
  const mine = settings({ source: "manual", weekly: week });
  const read = (iso: string) => decideHours(mine, null, at(iso)).openness;
  assert.equal(opennessDetail(read("2026-11-26T12:00:00"), at("2026-11-26T12:00:00")), "jusqu'à 14:00");
  assert.equal(opennessDetail(read("2026-11-26T15:00:00"), at("2026-11-26T15:00:00")), "ouvre à 18:00");
  assert.equal(opennessDetail(read("2026-11-27T01:30:00"), at("2026-11-27T01:30:00")), "jusqu'à 02:00");
  assert.equal(read("2026-11-27T02:00:00").state, "ferme");
});

test("changement d'heure : 11:00 reste 11:00 à Bruxelles", () => {
  const mine = settings({ source: "manual", weekly: every(s("11:00", "22:00")) });
  // Nuit du 27 au 28 mars 2027 : passage à l'heure d'été (UTC+2).
  const d = decideHours(mine, null, new Date("2027-03-27T22:00:00Z")).openness;
  assert.equal(d.state === "ferme" && d.opens?.at, "2027-03-28T09:00:00.000Z");
});

test("toute la journée et semaine fermée", () => {
  const always = decideHours(settings({ source: "manual", weekly: every(s("00:00", "00:00")) }), null, NOON).openness;
  assert.deepEqual(always, { state: "ouvert", closes: null });
  assert.deepEqual(decideHours(settings({ source: "manual", weekly: every() }), null, NOON).openness, { state: "ferme", opens: null });
});

test("un jour fermé court de 5 h à 5 h : fermer pendant la nuit ferme le service en cours, pas le lendemain", () => {
  assert.equal(serviceDay(at("2026-11-27T04:59:00")), "2026-11-26");
  assert.equal(serviceDay(at("2026-11-27T05:00:00")), "2026-11-27");
  const night = at("2026-11-27T00:30:00");
  const week = every(s("18:00", "02:00"));
  const open = decideHours(settings({ source: "manual", weekly: week }), null, night).openness;
  assert.equal(open.state, "ouvert");
  const day = dayToClose(open, night, "2026-11-27");
  assert.equal(day, "2026-11-26");
  const closed = settings({ source: "manual", weekly: week, closedToday: day });
  assert.equal(closedByRestaurant(closed, night), true);
  const after = decideHours(closed, null, night).openness;
  assert.equal(opennessDetail(after, night), "ouvre à 18:00"); // ce soir, le 27
  // Fermé à ce moment-là (rien ne court) : c'est la date du jour qui se ferme.
  assert.equal(dayToClose({ state: "ferme", opens: null }, night, "2026-11-27"), "2026-11-27");
});

test("un jour spécial à venir : le service d'avant finit à son heure, la réouverture saute le jour fermé", () => {
  const mine = settings({ source: "manual", weekly: every(s("11:00", "22:00")), closures: [{ from: "2026-11-27", to: "2026-11-28" }] });
  const evening = at("2026-11-26T23:00:00");
  assert.equal(opennessDetail(decideHours(mine, null, evening).openness, evening), "ouvre dimanche à 11:00");
  assert.equal(decideHours(mine, null, NOON).openness.state, "ouvert");
});

test("fermé aujourd'hui sans aucun horaire : « fermé », sans heure inventée", () => {
  const d = decideHours(settings({ closedToday: "2026-11-26" }), SILENT, NOON);
  assert.deepEqual([d.openness, d.origin, d.cause], [{ state: "ferme", opens: null }, "fermeture", null]);
});
