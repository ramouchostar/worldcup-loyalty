import { test } from "node:test";
import assert from "node:assert/strict";
import { blockableDays, buildCalendar, buildProviderCalendar, providerDayState, dayState, judgeDayEdit, judgeShootChoice, shootChoiceMessage, teamNoticeState, type Blocked } from "./mission-dates";

const TODAY = "2026-10-12"; // lundi
const none: Blocked = { unavailable: new Set(), booked: new Set() };
const blocked = (u: string[] = [], b: string[] = []): Blocked => ({ unavailable: new Set(u), booked: new Set(b) });

test("état d'un jour : passé, trop tôt, libre, bloqué, déjà pris", () => {
  assert.equal(dayState("2026-10-11", TODAY, none), "past");
  assert.equal(dayState("2026-10-12", TODAY, none), "too_soon");
  assert.equal(dayState("2026-10-18", TODAY, none), "too_soon");
  assert.equal(dayState("2026-10-19", TODAY, none), "free"); // J+7 pile
  assert.equal(dayState("2026-10-20", TODAY, blocked(["2026-10-20"])), "unavailable");
  assert.equal(dayState("2026-10-21", TODAY, blocked([], ["2026-10-21"])), "booked");
});

test("un jour réservé l'emporte sur un jour bloqué, et sur « trop tôt »", () => {
  assert.equal(dayState("2026-10-21", TODAY, blocked(["2026-10-21"], ["2026-10-21"])), "booked");
  assert.equal(dayState("2026-10-14", TODAY, blocked(["2026-10-14"])), "unavailable");
});

test("le calendrier commence le lundi de la semaine en cours et couvre 12 semaines", () => {
  const cal = buildCalendar(TODAY, none);
  assert.equal(cal[0].date, "2026-10-12");
  assert.equal(cal[0].weekday, 0);
  assert.equal(cal.at(-1)!.date, "2027-01-04");
  assert.equal(cal.length, 85);
  const sunday = buildCalendar("2026-10-18", none)[0];
  assert.equal(sunday.date, "2026-10-12"); // un dimanche : on remonte au lundi
});

test("mardi à jeudi sont les jours calmes conseillés", () => {
  const cal = buildCalendar(TODAY, none);
  assert.deepEqual(cal.slice(0, 7).map((d) => d.calm), [false, true, true, true, false, false, false]);
});

test("un choix valide : jour libre et créneau proposé", () => {
  const v = judgeShootChoice({ date: "2026-10-20", slotStart: "09:30", today: TODAY, blocked: none });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.slot.advice, "recommended");
});

test("un créneau déconseillé reste permis : c'est son restaurant", () => {
  const v = judgeShootChoice({ date: "2026-10-20", slotStart: "18:30", today: TODAY, blocked: none });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.slot.advice, "discouraged");
});

test("chaque refus a sa raison nommée", () => {
  const j = (date: string, slotStart = "09:30", b = none) => judgeShootChoice({ date, slotStart, today: TODAY, blocked: b });
  assert.deepEqual(j("demain"), { ok: false, issue: "date_invalid" });
  assert.deepEqual(j("2026-13-45"), { ok: false, issue: "date_invalid" });
  assert.deepEqual(j("2026-10-01"), { ok: false, issue: "past" });
  assert.deepEqual(j("2026-10-15"), { ok: false, issue: "too_soon" });
  assert.deepEqual(j("2027-03-01"), { ok: false, issue: "too_far" });
  assert.deepEqual(j("2026-10-21", "09:30", blocked(["2026-10-21"])), { ok: false, issue: "unavailable" });
  assert.deepEqual(j("2026-10-21", "09:30", blocked([], ["2026-10-21"])), { ok: false, issue: "booked" });
  assert.deepEqual(j("2026-10-21", "03:00"), { ok: false, issue: "slot_unknown" });
});

test("chaque refus a une phrase pour le restaurateur", () => {
  for (const i of ["date_invalid", "past", "too_soon", "too_far", "unavailable", "booked", "slot_unknown"] as const) assert.ok(shootChoiceMessage(i).length > 10, i);
});

test("jours à bloquer : dans le calendrier, sans doublon, triés", () => {
  assert.deepEqual(judgeDayEdit(["2026-10-30", "2026-10-20", "2026-10-30"], TODAY), { ok: true, days: ["2026-10-20", "2026-10-30"] });
  assert.deepEqual(judgeDayEdit([], TODAY), { ok: false, issue: "empty" });
  assert.deepEqual(judgeDayEdit(["2026-10-01"], TODAY), { ok: false, issue: "out_of_range" });
  assert.deepEqual(judgeDayEdit(["2027-06-01"], TODAY), { ok: false, issue: "out_of_range" });
  assert.deepEqual(judgeDayEdit(["pas-un-jour"], TODAY), { ok: false, issue: "invalid" });
  assert.deepEqual(judgeDayEdit(Array.from({ length: 101 }, (_, i) => `2026-11-${String(i).padStart(2, "0")}`), TODAY), { ok: false, issue: "too_many" });
});

test("on ne « bloque » pas un jour déjà réservé par une mission : il faudrait l'annuler", () => {
  assert.deepEqual(blockableDays(["2026-10-20", "2026-10-21"], new Set(["2026-10-21"])), { blockable: ["2026-10-20"], refused: ["2026-10-21"] });
});

test("équipe prévenue : trop tôt, c'est le jour, trop tard, ou déjà fait", () => {
  assert.equal(teamNoticeState("2026-10-27", "2026-10-15", false), "early");
  assert.equal(teamNoticeState("2026-10-27", "2026-10-20", false), "due"); // J-7
  assert.equal(teamNoticeState("2026-10-27", "2026-10-23", false), "late");
  assert.equal(teamNoticeState("2026-10-27", "2026-10-23", true), "notified");
});

test("le prestataire peut bloquer dès demain : « trop tôt » ne le concerne pas", () => {
  assert.equal(providerDayState("2026-10-13", TODAY, none), "free");
  assert.equal(providerDayState("2026-10-11", TODAY, none), "past");
  assert.equal(providerDayState("2026-10-14", TODAY, blocked(["2026-10-14"])), "unavailable");
  assert.equal(providerDayState("2026-10-14", TODAY, blocked(["2026-10-14"], ["2026-10-14"])), "booked");
  const cal = buildProviderCalendar(TODAY, blocked(["2026-10-14"]));
  assert.equal(cal[0].date, "2026-10-12");
  assert.equal(cal.find((d) => d.date === "2026-10-14")!.state, "unavailable");
  assert.equal(cal.find((d) => d.date === "2026-10-13")!.state, "free");
});
