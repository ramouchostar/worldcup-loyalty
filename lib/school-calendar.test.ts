import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSchoolCalendars,
  schoolCalendarsFromRow,
  schoolCalendarsColumns,
  isMissingSchoolCalendarsColumn,
} from "./school-calendar";

test("parseSchoolCalendars : nettoie, dédoublonne, ordonne, plafonne à 3", () => {
  assert.deepEqual(parseSchoolCalendars(["NL", "fr", "NL", "xx", "DE"]), ["FR", "NL", "DE"]);
  assert.deepEqual(parseSchoolCalendars("FR"), ["FR"]);
  assert.deepEqual(parseSchoolCalendars(""), []);
  assert.deepEqual(parseSchoolCalendars(null), []);
  assert.deepEqual(parseSchoolCalendars(["ZZ"]), []);
});

test("schoolCalendarsFromRow : nouvelle colonne prioritaire, repli legacy", () => {
  assert.deepEqual(schoolCalendarsFromRow({ school_calendars: ["FR", "NL"], school_calendar: "DE" }), ["FR", "NL"]);
  assert.deepEqual(schoolCalendarsFromRow({ school_calendars: null, school_calendar: "NL" }), ["NL"]);
  assert.deepEqual(schoolCalendarsFromRow({ school_calendar: "FR" }), ["FR"]);
  assert.deepEqual(schoolCalendarsFromRow(null), []);
});

test("schoolCalendarsColumns : écrit la liste + le miroir legacy (1er élément)", () => {
  assert.deepEqual(schoolCalendarsColumns(["NL", "FR"]), { school_calendars: ["FR", "NL"], school_calendar: "FR" });
  assert.deepEqual(schoolCalendarsColumns([]), { school_calendars: null, school_calendar: null });
});

test("isMissingSchoolCalendarsColumn : ne reconnaît que l'absence de colonne", () => {
  assert.equal(isMissingSchoolCalendarsColumn({ message: "column restaurants.school_calendars does not exist" }), true);
  assert.equal(isMissingSchoolCalendarsColumn({ message: "Could not find the 'school_calendars' column of 'restaurants' in the schema cache" }), true);
  assert.equal(isMissingSchoolCalendarsColumn({ message: "new row violates check constraint" }), false);
  assert.equal(isMissingSchoolCalendarsColumn(null), false);
});
