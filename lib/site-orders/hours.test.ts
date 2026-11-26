import assert from "node:assert/strict";
import { test } from "node:test";
import type { HoursBlock } from "../audit/places";
import { computeOpenness, nextChange, opennessAt, opennessDetail, openingRefusal, type Openness } from "./hours";

// Novembre 2026 : Bruxelles = UTC + 1. Le 26 novembre 2026 est un jeudi (jour 4), le 29 un dimanche (jour 0).
const THU_NOON = new Date("2026-11-26T11:00:00Z"); // jeudi 12:00 à Bruxelles
const at = (iso: string) => new Date(iso);
const d = (day: number, month = 11, year = 2026) => ({ year, month, day });
const dated = (from: [number, number, number?], to: [number, number, number?], extra: { open?: object; close?: object } = {}) => ({
  open: { date: d(from[0]), hour: from[1], minute: from[2] ?? 0, ...extra.open },
  close: { date: d(to[0]), hour: to[1], minute: to[2] ?? 0, ...extra.close },
});
const weekly = (day: number, hour: number, closeDay: number, closeHour: number) => ({ open: { day, hour, minute: 0 }, close: { day: closeDay, hour: closeHour, minute: 0 } });
const state = (o: Openness) => o.state;

test("ouvert : l'heure de fermeture du jour, à l'heure de Bruxelles", () => {
  const o = computeOpenness({ current: { periods: [dated([26, 11], [26, 22])] } }, THU_NOON);
  assert.deepEqual(o, { state: "ouvert", closes: { day: "2026-11-26", time: "22:00", at: "2026-11-26T21:00:00.000Z" } });
  assert.equal(opennessDetail(o, THU_NOON), "jusqu'à 22:00");
});

test("les bornes : ouvert à la minute de l'ouverture, fermé à la minute de la fermeture", () => {
  const current = { periods: [dated([26, 11], [26, 22])] };
  assert.equal(state(computeOpenness({ current }, at("2026-11-26T09:59:00Z"))), "ferme");
  assert.equal(state(computeOpenness({ current }, at("2026-11-26T10:00:00Z"))), "ouvert");
  assert.equal(state(computeOpenness({ current }, at("2026-11-26T20:59:00Z"))), "ouvert");
  assert.equal(state(computeOpenness({ current }, at("2026-11-26T21:00:00Z"))), "ferme");
});

test("fermé : la prochaine ouverture, aujourd'hui, demain, un jour de la semaine", () => {
  const morning = at("2026-11-26T07:00:00Z");
  assert.equal(opennessDetail(computeOpenness({ current: { periods: [dated([26, 11], [26, 22])] } }, morning), morning), "ouvre à 11:00");
  const night = at("2026-11-26T22:00:00Z"); // 23:00
  assert.equal(opennessDetail(computeOpenness({ current: { periods: [dated([26, 11], [26, 22]), dated([27, 11], [27, 22])] } }, night), night), "ouvre demain à 11:00");
  assert.equal(opennessDetail(computeOpenness({ current: { periods: [dated([30, 11, 30], [30, 22])] } }, night), night), "ouvre lundi à 11:30");
});

test("des horaires qui passent minuit : encore ouvert à 00:30, fermé à 02:00", () => {
  const current = { periods: [dated([26, 18], [27, 2])] };
  const evening = at("2026-11-26T19:00:00Z"); // 20:00
  const open = computeOpenness({ current }, evening);
  assert.equal(opennessDetail(open, evening), "jusqu'à 02:00");
  assert.equal(state(computeOpenness({ current }, at("2026-11-26T23:30:00Z"))), "ouvert"); // 00:30 le 27
  assert.equal(state(computeOpenness({ current }, at("2026-11-27T01:00:00Z"))), "ferme"); // 02:00
});

test("horaires ordinaires : une ouverture de samedi soir couvre le dimanche à l'aube (la semaine boucle)", () => {
  const regular = { periods: [weekly(6, 18, 0, 3)] };
  assert.equal(state(computeOpenness({ regular }, at("2026-11-29T00:30:00Z"))), "ouvert"); // dimanche 01:30
  const sundayNoon = at("2026-11-29T11:00:00Z");
  const o = computeOpenness({ regular }, sundayNoon);
  assert.equal(o.state, "ferme");
  assert.equal(opennessDetail(o, sundayNoon), "ouvre samedi à 18:00");
});

test("jour exceptionnel : les horaires courants l'emportent sur les ordinaires", () => {
  const regular = { periods: [weekly(4, 11, 4, 22), weekly(5, 11, 5, 22)] };
  // Ce jeudi, la fiche annonce une fermeture : la période du jour manque dans les horaires courants.
  const current = { openNow: false, periods: [dated([27, 11], [27, 22])] };
  const o = computeOpenness({ current, regular }, THU_NOON);
  assert.equal(o.state, "ferme");
  assert.equal(opennessDetail(o, THU_NOON), "ouvre demain à 11:00");
});

test("fermé toute la semaine : aucune période courante, la réouverture annoncée si Google la donne", () => {
  const regular = { periods: [weekly(4, 11, 4, 22)] };
  assert.deepEqual(computeOpenness({ current: { openNow: false }, regular }, THU_NOON), { state: "ferme", opens: null });
  const o = computeOpenness({ current: { openNow: false, nextOpenTime: "2026-12-03T10:00:00Z" }, regular }, THU_NOON);
  assert.equal(opennessDetail(o, THU_NOON), "ouvre le 3 décembre à 11:00");
});

test("un établissement fermé temporairement ou définitivement est fermé, quels que soient ses horaires", () => {
  const current = { periods: [dated([26, 11], [26, 22])] };
  for (const businessStatus of ["CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY", "FUTURE_OPENING"]) {
    assert.deepEqual(computeOpenness({ businessStatus, current }, THU_NOON), { state: "ferme", opens: null }, businessStatus);
  }
  assert.equal(state(computeOpenness({ businessStatus: "OPERATIONAL", current }, THU_NOON)), "ouvert");
});

test("24 heures sur 24 : ouvert sans heure de fermeture inventée (horaires ordinaires et fenêtre de sept jours coupée)", () => {
  assert.deepEqual(computeOpenness({ regular: { periods: [{ open: { day: 0 } }] } }, THU_NOON), { state: "ouvert", closes: null });
  const current: HoursBlock = { periods: [{ open: { date: d(26), truncated: true }, close: { date: d(2, 12), hour: 23, minute: 59, truncated: true } }] };
  assert.deepEqual(computeOpenness({ current }, THU_NOON), { state: "ouvert", closes: null });
});

test("deux périodes qui se touchent n'en font qu'une : « jusqu'à » dit la vraie fermeture", () => {
  const o = computeOpenness({ current: { periods: [dated([26, 11], [27, 0]), dated([27, 0], [27, 1])] } }, THU_NOON);
  assert.equal(o.state === "ouvert" && o.closes?.time, "01:00");
});

test("minuit et l'heure pleine omis par Google (hour, minute absents) se lisent zéro", () => {
  const current: HoursBlock = { periods: [{ open: { date: d(26), hour: 11 }, close: { date: d(27) } }] };
  const o = computeOpenness({ current }, THU_NOON);
  assert.equal(opennessDetail(o, THU_NOON), "jusqu'à 00:00");
});

test("horaires inconnus : rien dans la fiche, ou des horaires illisibles ; jamais de repli qui ignore un jour exceptionnel", () => {
  assert.deepEqual(computeOpenness({}, THU_NOON), { state: "inconnu" });
  assert.deepEqual(computeOpenness({ current: {}, regular: {} }, THU_NOON), { state: "inconnu" });
  assert.deepEqual(computeOpenness({ regular: { periods: [{ open: { day: 9, hour: 11 }, close: { day: 9, hour: 22 } }] } }, THU_NOON), { state: "inconnu" });
  const broken: HoursBlock = { periods: [{ open: { hour: 11 }, close: { hour: 22 } }] }; // sans date
  assert.deepEqual(computeOpenness({ current: broken, regular: { periods: [weekly(4, 11, 4, 22)] } }, THU_NOON), { state: "inconnu" });
});

test("sans horaires courants, les ordinaires servent", () => {
  const o = computeOpenness({ current: null, regular: { periods: [weekly(4, 11, 4, 22)] } }, THU_NOON);
  assert.equal(opennessDetail(o, THU_NOON), "jusqu'à 22:00");
});

test("changement d'heure : la fermeture est dite à l'heure du restaurant, l'instant tient compte du décalage", () => {
  // Dernier dimanche de mars 2027 (le 28) : Bruxelles passe à UTC + 2.
  const current = { periods: [{ open: { date: d(28, 3, 2027), hour: 11 }, close: { date: d(28, 3, 2027), hour: 22 } }] };
  const o = computeOpenness({ current }, at("2027-03-28T10:00:00Z"));
  assert.equal(o.state === "ouvert" && o.closes?.at, "2027-03-28T20:00:00.000Z");
  assert.equal(o.state === "ouvert" && o.closes?.time, "22:00");
});

test("opennessAt : une fermeture passée ferme sans relecture ; une ouverture passée ne rouvre pas toute seule", () => {
  const open = computeOpenness({ current: { periods: [dated([26, 11], [26, 22])] } }, THU_NOON);
  assert.equal(opennessAt(open, at("2026-11-26T20:59:00Z")).state, "ouvert");
  assert.deepEqual(opennessAt(open, at("2026-11-26T21:00:00Z")), { state: "ferme", opens: null });
  assert.equal(nextChange(open), "2026-11-26T21:00:00.000Z");
  const closed = computeOpenness({ current: { periods: [dated([27, 11], [27, 22])] } }, THU_NOON);
  assert.equal(opennessAt(closed, at("2026-11-27T12:00:00Z")).state, "ferme");
  assert.equal(nextChange(closed), "2026-11-27T10:00:00.000Z");
  assert.equal(nextChange({ state: "inconnu" }), null);
});

test("openingRefusal : la même règle pour la page et le serveur", () => {
  assert.equal(openingRefusal({ state: "ouvert", closes: null }), null);
  assert.equal(openingRefusal({ state: "ferme", opens: null })?.code, "ferme");
  assert.equal(openingRefusal({ state: "ferme", opens: null })?.message, "Le restaurant est fermé pour le moment. Ton panier est gardé.");
  assert.equal(openingRefusal({ state: "inconnu" })?.code, "horaires_inconnus");
});
