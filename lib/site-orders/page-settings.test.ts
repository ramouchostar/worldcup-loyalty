import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PRESENTATION, NO_SETTINGS, addClosure, allClosures, checkContact, checkHoursChoice, checkOffers, closureLabel, presentationLine,
  readSettingsRow, removeClosure,
} from "./page-settings";

const WEEK = Array.from({ length: 7 }, () => [{ open: "11:00", close: "22:00" }]);
const TODAY = "2026-11-26";

test("une ligne de la base se relit sans rien croire : l'illisible est ignoré, jamais fatal", () => {
  const read = readSettingsRow({
    hours_source: "autre", weekly_hours: [[1]], closures: [{ from: "2026-12-25", to: "2026-12-25" }, { from: "2026-02-30", to: "2026-03-01" }, { from: "2026-12-02", to: "2026-12-01" }, null],
    closed_today: "hier", presentation: "  ", offers_terrace: "oui", offers_dine_in: true,
  });
  assert.deepEqual(read, { ...NO_SETTINGS, closures: [{ from: "2026-12-25", to: "2026-12-25" }], offers: { terrace: false, dineIn: true, matchScreen: false } });
  assert.deepEqual(readSettingsRow(null), NO_SETTINGS);
  assert.equal(readSettingsRow({ hours_source: "manual", weekly_hours: WEEK }).source, "manual");
});

test("« Fermer pour aujourd'hui » compte comme une fermeture", () => {
  assert.deepEqual(allClosures({ ...NO_SETTINGS, closedToday: TODAY }), [{ from: TODAY, to: TODAY }]);
});

test("ajouter un jour spécial : un jour ou plusieurs, jamais dans le passé ; les passés sont oubliés", () => {
  const old = [{ from: "2026-01-01", to: "2026-01-01" }];
  const one = addClosure(old, { from: "2026-12-25", to: "" }, TODAY);
  assert.deepEqual(one, { ok: true, value: [{ from: "2026-12-25", to: "2026-12-25" }] });
  const two = addClosure(one.ok ? one.value : [], { from: "2026-12-01", to: "2026-12-03" }, TODAY);
  assert.deepEqual(two.ok && two.value.map((c) => c.from), ["2026-12-01", "2026-12-25"]);
  for (const bad of [{}, { from: "25/12" }, { from: "2026-12-03", to: "2026-12-01" }, { from: "2026-11-25" }, { from: "2026-12-01", to: "2028-12-01" }]) {
    assert.equal(addClosure([], bad, TODAY).ok, false, JSON.stringify(bad));
  }
  const many = Array.from({ length: 40 }, (_, i) => ({ from: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`, to: `2027-02-${String((i % 28) + 1).padStart(2, "0")}` }));
  assert.equal(addClosure(many, { from: "2027-06-01" }, TODAY).ok, false);
});

test("retirer un jour spécial et le dire", () => {
  const list = [{ from: "2026-12-24", to: "2026-12-26" }, { from: "2026-12-31", to: "2027-01-01" }];
  assert.deepEqual(removeClosure(list, { from: "2026-12-24", to: "2026-12-26" }), [list[1]]);
  assert.equal(closureLabel({ from: "2026-12-25", to: "2026-12-25" }), "25 décembre : fermé");
  assert.equal(closureLabel(list[0]), "Du 24 au 26 décembre : fermé");
  assert.equal(closureLabel(list[1]), "Du 31 décembre au 1er janvier : fermé");
  assert.equal(closureLabel({ from: "2027-01-01", to: "2027-01-03" }), "Du 1er au 3 janvier : fermé");
});

test("téléphone, adresse et présentation : vide efface, l'illisible est refusé", () => {
  assert.deepEqual(checkContact("phone", " 02 123 45 67 "), { ok: true, value: { field: "phone", value: "02 123 45 67" } });
  assert.deepEqual(checkContact("address", ""), { ok: true, value: { field: "address", value: null } });
  assert.equal(checkContact("phone", "appelle-moi").ok, false);
  assert.equal(checkContact("phone", "123").ok, false);
  assert.equal(checkContact("address", "ici").ok, false);
  assert.equal(checkContact("presentation", "x".repeat(MAX_PRESENTATION + 1)).ok, false);
  assert.deepEqual(checkContact("presentation", "<b>Poulet</b>\nfrit"), { ok: true, value: { field: "presentation", value: "b Poulet /b frit" } });
  assert.equal(checkContact("name", "x").ok, false);
});

test("ce que tu proposes : trois cases, rien d'autre", () => {
  assert.equal(checkOffers({ terrace: true, dineIn: false, matchScreen: false }).ok, true);
  assert.equal(checkOffers({ terrace: "oui", dineIn: false, matchScreen: false }).ok, false);
});

test("choisir les horaires : « Les miens » demande une semaine ; revenir à Google la garde", () => {
  assert.equal(checkHoursChoice({ source: "manual" }, NO_SETTINGS).ok, false);
  assert.deepEqual(checkHoursChoice({ source: "manual", weekly: WEEK }, NO_SETTINGS), { ok: true, value: { source: "manual", weekly: WEEK } });
  const saved = { ...NO_SETTINGS, source: "manual" as const, weekly: WEEK };
  assert.deepEqual(checkHoursChoice({ source: "google", weekly: null }, saved), { ok: true, value: { source: "google", weekly: WEEK } });
  assert.equal(checkHoursChoice({ source: "google", weekly: [[]] }, saved).ok, false);
});

test("la phrase sous le nom : la sienne, sinon composée avec le type de cuisine", () => {
  assert.equal(presentationLine({ presentation: "Poulet frit maison", cuisine: "Poulet" }), "Poulet frit maison");
  assert.equal(presentationLine({ cuisine: "Poulet frit" }), "Poulet frit, à emporter");
  assert.equal(presentationLine({}), "À emporter");
});
