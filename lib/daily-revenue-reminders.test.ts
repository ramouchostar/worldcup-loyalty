import { test } from "node:test";
import assert from "node:assert/strict";
import { closingFromPeriods, planReminders, reminderTargetDay, reminderText, type ClosingTimes } from "./daily-revenue-reminders";

const at = (h: number, m = 0) => h * 60 + m;

// Horaires réels lus sur les fiches Google le 2026-10-24.
const HOUBA = closingFromPeriods([
  { open: { day: 0, hour: 11, minute: 30 }, close: { day: 0, hour: 23, minute: 0 } },
  { open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 22, minute: 0 } },
  { open: { day: 2, hour: 11, minute: 30 }, close: { day: 2, hour: 22, minute: 0 } },
  { open: { day: 3, hour: 11, minute: 30 }, close: { day: 3, hour: 22, minute: 0 } },
  { open: { day: 4, hour: 11, minute: 30 }, close: { day: 4, hour: 22, minute: 0 } },
  { open: { day: 5, hour: 11, minute: 30 }, close: { day: 5, hour: 23, minute: 0 } },
  { open: { day: 6, hour: 11, minute: 30 }, close: { day: 6, hour: 23, minute: 0 } },
]);
const KRAAINEM = closingFromPeriods([
  { open: { day: 4, hour: 11, minute: 0 }, close: { day: 5, hour: 1, minute: 0 } },
  { open: { day: 5, hour: 11, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
  { open: { day: 6, hour: 11, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } },
]);

const plan = (today: string, now: number, closing: ClosingTimes | null, covered: string[] = [], sent: string[] = []) =>
  planReminders({ today, nowMinutes: now, closing, covered: new Set(covered), sent: new Set(sent) });

test("closingFromPeriods : dernière fermeture par jour, après minuit au-delà de 1440, inconnu si 24 h/24", () => {
  assert.equal(HOUBA?.[5], at(23)); // vendredi
  assert.equal(HOUBA?.[1], at(22)); // lundi
  assert.equal(KRAAINEM?.[5], 1440 + at(2)); // vendredi → samedi 2 h
  assert.equal(KRAAINEM?.[6], 1440 + at(2)); // samedi → dimanche 2 h
  assert.equal(KRAAINEM?.[1], null); // pas de période : fermé
  assert.equal(closingFromPeriods([{ open: { day: 0, hour: 0, minute: 0 } }]), null);
  assert.equal(closingFromPeriods([]), null);
});

test("soir : 30 min après la fermeture, pas avant", () => {
  // Vendredi 23/10, Houba ferme à 23 h.
  const jeudiNote = ["2026-10-22"];
  assert.deepEqual(plan("2026-10-23", at(23, 0), HOUBA, jeudiNote), []);
  assert.deepEqual(plan("2026-10-23", at(23, 30), HOUBA, jeudiNote), [{ slot: "soir", day: "2026-10-23" }]);
  // Jeudi pas noté non plus : le rappel de 18 h pour jeudi est encore dû.
  assert.deepEqual(plan("2026-10-23", at(23, 30), HOUBA), [{ slot: "soir", day: "2026-10-23" }, { slot: "18h", day: "2026-10-22" }]);
});

test("soir : une fermeture après minuit donne le rappel le lendemain matin, pour le jour des ventes", () => {
  // Vendredi 23/10 : Kraainem ferme samedi à 2 h → rappel samedi 2 h 30 pour le vendredi.
  assert.deepEqual(plan("2026-10-24", at(2, 0), KRAAINEM), []);
  assert.deepEqual(plan("2026-10-24", at(3, 0), KRAAINEM), [{ slot: "soir", day: "2026-10-23" }]);
});

test("soir : sans horaires, 23 h 30 + 30 min ; plus rien après 6 h le lendemain", () => {
  // 23 h 30 par défaut, + 30 min : minuit.
  assert.deepEqual(plan("2026-10-23", at(23, 59), null, ["2026-10-22"]), []);
  assert.deepEqual(plan("2026-10-24", at(0, 30), null, [], []), [{ slot: "soir", day: "2026-10-23" }]);
  assert.deepEqual(plan("2026-10-24", at(7, 0), null), []);
});

test("lendemain : 10 h, 15 h, 18 h — le dernier créneau échu, une seule fois", () => {
  assert.deepEqual(plan("2026-10-24", at(10, 5), HOUBA, [], ["2026-10-23|soir"]), [{ slot: "10h", day: "2026-10-23" }]);
  assert.deepEqual(plan("2026-10-24", at(11, 0), HOUBA, [], ["2026-10-23|soir", "2026-10-23|10h"]), []);
  // Tâche en panne à 10 h : à 15 h on n'envoie que le rappel de 15 h.
  assert.deepEqual(plan("2026-10-24", at(15, 0), HOUBA, [], ["2026-10-23|soir"]), [{ slot: "15h", day: "2026-10-23" }]);
  assert.deepEqual(plan("2026-10-24", at(18, 0), HOUBA, [], ["2026-10-23|soir", "2026-10-23|10h", "2026-10-23|15h"]), [{ slot: "18h", day: "2026-10-23" }]);
});

test("dès que le jour est noté, plus aucun rappel pour lui", () => {
  assert.deepEqual(plan("2026-10-24", at(15, 0), HOUBA, ["2026-10-23"]), []);
  assert.deepEqual(plan("2026-10-23", at(23, 45), HOUBA, ["2026-10-22", "2026-10-23"]), []);
});

test("un jour fermé selon la fiche ne se réclame jamais", () => {
  // Kraainem n'a pas de période le lundi 19/10.
  assert.deepEqual(plan("2026-10-20", at(10, 0), KRAAINEM), []);
  assert.deepEqual(plan("2026-10-19", at(23, 59), KRAAINEM), []);
});

test("dimanche 15 h : les jours vides de lundi à samedi, une fois", () => {
  // Dimanche 25/10 ; notés : lundi 19, mercredi 21 → jeudi 22, samedi 24.
  const covered = ["2026-10-19", "2026-10-21", "2026-10-22", "2026-10-24"];
  const sentYesterday = ["2026-10-24|soir"]; // samedi déjà noté de toute façon
  assert.deepEqual(plan("2026-10-25", at(14, 59), HOUBA, covered, sentYesterday), []);
  assert.deepEqual(plan("2026-10-25", at(15, 0), HOUBA, covered, sentYesterday), [
    { slot: "semaine", day: "2026-10-25", days: ["2026-10-20", "2026-10-23"] },
  ]);
  assert.deepEqual(plan("2026-10-25", at(16, 0), HOUBA, covered, [...sentYesterday, "2026-10-25|semaine"]), []);
  // Semaine complète : rien.
  assert.deepEqual(plan("2026-10-25", at(15, 0), HOUBA, ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]), []);
});

test("textes : jamais une date collée à un nombre autour des deux-points", () => {
  const soir = reminderText({ slot: "soir", day: "2026-10-23" });
  assert.equal(soir.title, "Ton CA de ce soir ?");
  assert.equal(soir.subject, "Ton CA du vendredi 23 octobre");
  assert.equal(reminderText({ slot: "10h", day: "2026-10-23" }).subject, "Il manque ton CA du vendredi 23 octobre");
  const semaine = reminderText({ slot: "semaine", day: "2026-10-25", days: ["2026-10-20", "2026-10-23"] });
  assert.equal(semaine.title, "Ta semaine : 2 jours à compléter");
  assert.equal(semaine.body, "Mardi, vendredi : complète-les pour que ta comparaison de lundi soit juste.");
  for (const t of [soir, semaine]) assert.doesNotMatch(`${t.title} ${t.body}`, /\d\s*:\s*\d/);
});

test("reminderTargetDay : le jour du rappel, ou le plus ancien manquant de la semaine", () => {
  assert.equal(reminderTargetDay({ slot: "18h", day: "2026-10-23" }), "2026-10-23");
  assert.equal(reminderTargetDay({ slot: "semaine", day: "2026-10-25", days: ["2026-10-20", "2026-10-23"] }), "2026-10-20");
});

test("brusselsNow : jour et minute de Bruxelles, heure d'été comprise", async () => {
  const { brusselsNow } = await import("./daily-revenue-reminders-runner");
  // 24/10 21:30 UTC = 23:30 à Bruxelles (UTC+2, heure d'été).
  assert.deepEqual(brusselsNow(new Date("2026-10-24T21:30:00Z")), { today: "2026-10-24", minutes: 23 * 60 + 30 });
  // 26/10 23:30 UTC = 27/10 00:30 à Bruxelles (UTC+1 après le 25/10).
  assert.deepEqual(brusselsNow(new Date("2026-10-26T23:30:00Z")), { today: "2026-10-27", minutes: 30 });
});
