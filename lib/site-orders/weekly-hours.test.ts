import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWeekly, dayText, draftOf, draftServices, googleWeekly, groupDays, isBlank, weeklySummary, type Service, type WeeklyHours } from "./weekly-hours";

const s = (open: string, close: string): Service => ({ open, close });
const LUNCH_DINNER = [s("11:00", "14:00"), s("18:00", "22:00")];
const week = (days: Service[][]): WeeklyHours => days;

test("une semaine saisie : sept jours, deux services au plus, qui ne se recouvrent pas", () => {
  const ok = week([LUNCH_DINNER, [s("18:00", "02:00")], [s("00:00", "00:00")], [], [], [], []]);
  assert.deepEqual(checkWeekly(ok), { ok: true, weekly: ok });
  const refusals: [unknown, RegExp][] = [
    [[[]], /sept jours/],
    [week([[s("11:00", "12:00"), s("13:00", "14:00"), s("15:00", "16:00")], [], [], [], [], [], []]), /Lundi : deux services/],
    [week([[], [s("11:00", "")], [], [], [], [], []]), /Mardi : indique/],
    [week([[], [], [s("11:00", "11:00")], [], [], [], []]), /Mercredi/],
    [week([[], [], [], [s("11:00", "15:00"), s("14:00", "22:00")], [], [], []]), /Jeudi : le deuxième service/],
    [week([[], [], [], [], [s("18:00", "02:00"), s("19:00", "22:00")], [], []]), /Vendredi : le deuxième service/],
  ];
  for (const [raw, message] of refusals) {
    const r = checkWeekly(raw);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, message);
  }
});

test("la semaine en quelques lignes", () => {
  const six = week([...Array.from({ length: 6 }, () => [s("11:00", "22:00")]), []]);
  assert.deepEqual(weeklySummary(six), ["Lundi au samedi, 11:00 à 22:00", "Dimanche fermé"]);
  assert.deepEqual(weeklySummary(week(Array.from({ length: 7 }, () => LUNCH_DINNER))), ["Tous les jours, 11:00 à 14:00, 18:00 à 22:00"]);
  assert.deepEqual(weeklySummary(week([[], [], [], [], [], [s("00:00", "00:00")], [s("00:00", "00:00")]])), ["Lundi au vendredi fermé", "Samedi et dimanche, 24 h sur 24"]);
  assert.equal(dayText([]), "fermé");
});

test("la saisie : un jour vide reste « à compléter », « Fermé » n'envoie aucun service", () => {
  const days = draftOf(null);
  assert.ok(days.every(isBlank));
  assert.deepEqual(draftServices({ ...days[0], closed: true, open1: "11:00" }), []);
  assert.deepEqual(draftServices({ ...days[0], open1: "11:00", close1: "22:00" }), [s("11:00", "22:00")]);
  assert.equal(draftServices({ ...days[0], open1: "11:00", close1: "14:00", open2: "18:00" }).length, 2);
  const saved = week([LUNCH_DINNER, [], [], [], [], [], []]);
  assert.deepEqual(draftOf(saved).map(draftServices), saved);
});

test("la liste des autres jours : « comme mardi », le jour ouvert n'y est pas", () => {
  const days = draftOf(week([[s("11:00", "14:00")], LUNCH_DINNER, LUNCH_DINNER, LUNCH_DINNER, LUNCH_DINNER, LUNCH_DINNER, []]));
  assert.deepEqual(groupDays(days, 0).map((g) => [g.label, g.sameAs ?? g.text, g.first]), [
    ["Mardi", "11:00 à 14:00, 18:00 à 22:00", 1],
    ["Mercredi à samedi", "mardi", 2],
    ["Dimanche", "fermé", 6],
  ]);
  // Le jour ouvert coupe un groupe ; les jours à compléter ne se regroupent pas.
  assert.deepEqual(groupDays(days, 3).map((g) => g.label), ["Lundi", "Mardi", "Mercredi", "Vendredi", "Samedi", "Dimanche"]);
  assert.equal(groupDays(draftOf(null), 0).length, 6);
  assert.equal(groupDays(draftOf(null), 0)[0].text, "à compléter");
});

test("la semaine ordinaire de la fiche, pour la montrer : lundi d'abord", () => {
  const period = (day: number, open: number, close: number, closeDay = day) => ({ open: { day, hour: open }, close: { day: closeDay, hour: close } });
  const g = googleWeekly({ periods: [period(0, 12, 20), period(1, 18, 22), period(1, 11, 14), period(5, 18, 2, 6)] });
  assert.deepEqual(g?.[0], [s("11:00", "14:00"), s("18:00", "22:00")]);
  assert.deepEqual(g?.[4], [s("18:00", "02:00")]);
  assert.deepEqual(g?.[6], [s("12:00", "20:00")]);
  assert.deepEqual(g?.[1], []);
  assert.deepEqual(googleWeekly({ periods: [{ open: { day: 0 } }] })?.[3], [s("00:00", "00:00")]);
  assert.equal(googleWeekly({ periods: [period(1, 11, 22, 3)] }), null);
  assert.equal(googleWeekly(null), null);
});
