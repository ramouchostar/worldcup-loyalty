import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, dueReminders, judgeConfirm, presenceState, reminderId, type ReminderMission } from "./mission-reminders";
import { brusselsInstant } from "./mission-cancellation";

const SHOOT = "2026-10-27"; // mardi
const m = (over: Partial<ReminderMission> = {}): ReminderMission => ({
  id: "m1",
  status: "date_bloquee",
  shoot_date: SHOOT,
  team_notified_at: null,
  j2_confirmed_provider_at: null,
  j2_confirmed_restaurant_at: null,
  ...over,
});
const due = (today: string, mission: ReminderMission = m(), sent: string[] = []) =>
  dueReminders([mission], today, new Set(sent)).map((d) => `${d.key}:${d.audience}`).sort();

test("J-7 : le restaurateur est invité à prévenir son équipe, pas le prestataire", () => {
  assert.deepEqual(due("2026-10-20"), ["j7:restaurant"]);
});

test("J-7 : rien si l'équipe est déjà prévenue", () => {
  assert.deepEqual(due("2026-10-20", m({ team_notified_at: "2026-10-19T10:00:00Z" })), []);
});

test("avant J-7 rien ; le rattrapage du j7 court jusqu'à J-3 puis s'arrête (jamais le jour de la confirmation)", () => {
  assert.deepEqual(due("2026-10-19"), []);
  assert.deepEqual(due("2026-10-22"), ["j7:restaurant"]); // cron raté deux jours : le rappel part encore
  assert.deepEqual(due("2026-10-24"), ["j7:restaurant"]); // J-3, dernière fenêtre
  assert.deepEqual(due("2026-10-25"), ["j2:provider", "j2:restaurant"]); // J-2 : le j7 n'a plus lieu d'être
});

test("J-2 : les deux sont invités à confirmer leur présence", () => {
  assert.deepEqual(due("2026-10-25"), ["j2:provider", "j2:restaurant"]);
});

test("J-2 : celui qui a déjà confirmé n'est pas relancé", () => {
  assert.deepEqual(due("2026-10-25", m({ j2_confirmed_provider_at: "2026-10-25T08:00:00Z" })), ["j2:restaurant"]);
});

test("la veille : le récap part à ceux qui ont reçu le j2 ; l'alerte part si quelqu'un n'a pas confirmé", () => {
  const sent = [reminderId("m1", "j2", "restaurant"), reminderId("m1", "j2", "provider")];
  assert.deepEqual(due("2026-10-26", m(), sent), ["alerte:platform", "veille:provider", "veille:restaurant"]);
});

test("la veille, tout le monde a confirmé : le récap part, aucune alerte", () => {
  const both = m({ j2_confirmed_provider_at: "x", j2_confirmed_restaurant_at: "y" });
  const sent = [reminderId("m1", "j2", "restaurant"), reminderId("m1", "j2", "provider")];
  assert.deepEqual(due("2026-10-26", both, sent), ["veille:provider", "veille:restaurant"]);
});

test("si le j2 n'est jamais parti (cron raté), la veille envoie le j2 — un seul e-mail par personne", () => {
  assert.deepEqual(due("2026-10-26"), ["alerte:platform", "j2:provider", "j2:restaurant"]);
});

test("un rappel déjà envoyé ne repart jamais", () => {
  const sent = [reminderId("m1", "j7", "restaurant")];
  assert.deepEqual(due("2026-10-20", m(), sent), []);
  const all = ["j2", "veille"].flatMap((k) => ["restaurant", "provider"].map((a) => `m1:${k}:${a}`)).concat("m1:alerte:platform");
  assert.deepEqual(due("2026-10-26", m(), all), []);
});

test("le jour J et après : plus aucun rappel", () => {
  assert.deepEqual(due("2026-10-27"), []);
  assert.deepEqual(due("2026-10-28"), []);
});

test("seule une mission à date réservée est rappelée", () => {
  for (const status of ["accepte", "devis", "annule", "production", "livre", "suspendu", "verse"]) assert.deepEqual(due("2026-10-20", m({ status })), [], status);
  assert.deepEqual(due("2026-10-20", m({ shoot_date: null })), []);
});

test("plusieurs missions : chacune son rappel", () => {
  const r = dueReminders([m({ id: "a" }), m({ id: "b", shoot_date: "2026-11-10" })], "2026-10-20", new Set());
  assert.deepEqual(r.map((x) => `${x.missionId}:${x.key}`), ["a:j7"]);
});

test("confirmer : de J-2 au jour J compris", () => {
  assert.equal(judgeConfirm(SHOOT, "2026-10-24"), "too_early");
  assert.equal(judgeConfirm(SHOOT, "2026-10-25"), "ok");
  assert.equal(judgeConfirm(SHOOT, "2026-10-27"), "ok");
  assert.equal(judgeConfirm(SHOOT, "2026-10-28"), "too_late");
  assert.equal(judgeConfirm(null, "2026-10-25"), "no_date");
});

test("où en est la présence", () => {
  assert.equal(presenceState({ j2_confirmed_provider_at: null, j2_confirmed_restaurant_at: null }), "none");
  assert.equal(presenceState({ j2_confirmed_provider_at: "x", j2_confirmed_restaurant_at: null }), "provider_only");
  assert.equal(presenceState({ j2_confirmed_provider_at: null, j2_confirmed_restaurant_at: "x" }), "restaurant_only");
  assert.equal(presenceState({ j2_confirmed_provider_at: "x", j2_confirmed_restaurant_at: "y" }), "both");
});

// ── .ics ──
const NOW = new Date("2026-10-12T10:00:00Z");

test("le fichier calendrier : heure de Bruxelles convertie en UTC, CRLF, échappements", () => {
  const ics = buildIcs({
    uid: "m1",
    summary: "Tournage chez Burger Palace, mardi",
    start: brusselsInstant("2026-10-27", "09:30"),
    end: brusselsInstant("2026-10-27", "11:30"),
    description: "Contact : Karim ; 0470 12 34 56\nAccès : cour",
    alarmDaysBefore: 2,
    now: NOW,
  });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /DTSTART:20261027T083000Z\r\n/); // 09:30 à Bruxelles, UTC+1 après le 25 octobre
  assert.match(ics, /DTEND:20261027T103000Z\r\n/);
  assert.match(ics, /DTSTAMP:20261012T100000Z\r\n/);
  assert.match(ics, /UID:m1@boosteats\.be\r\n/);
  assert.match(ics, /SUMMARY:Tournage chez Burger Palace\\, mardi\r\n/);
  assert.match(ics, /Karim \\; 0470 12 34 56\\nAcc/);
  assert.match(ics, /TRIGGER:-P2D\r\n/);
  assert.ok(!/[^\r]\n/.test(ics), "chaque fin de ligne est un CRLF");
});

test("une ligne de plus de 75 octets est repliée, sans couper un caractère accentué", () => {
  const ics = buildIcs({ uid: "m2", summary: "é".repeat(80), start: brusselsInstant("2026-10-27", "09:30"), end: brusselsInstant("2026-10-27", "11:30"), now: NOW });
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, line.slice(0, 20));
  assert.equal(ics.replace(/\r\n /g, "").match(/SUMMARY:(é+)/)![1].length, 80);
});

test("avant le passage à l'heure d'hiver, Bruxelles est à UTC+2", () => {
  const ics = buildIcs({ uid: "m3", summary: "x", start: brusselsInstant("2026-10-20", "09:30"), end: brusselsInstant("2026-10-20", "11:30"), now: NOW });
  assert.match(ics, /DTSTART:20261020T073000Z/);
});
