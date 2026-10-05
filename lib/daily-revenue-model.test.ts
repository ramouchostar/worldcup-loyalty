import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  dayLabel,
  parseAmount,
  parseTime,
  replyMessage,
  testStats,
  verdictFor,
  weeklyRecap,
  type DailyEntry,
  type Outcome,
} from "./daily-revenue-model";

const e = (sales_day: string, outcome: Outcome, amount: number | null = null, extra: Partial<DailyEntry> = {}): DailyEntry => ({
  sales_day,
  outcome,
  amount,
  tickets: null,
  asked_at: "10:00",
  replied_at: null,
  note: null,
  ...extra,
});

test("parseAmount : formats tapés à la main, milliers belges", () => {
  assert.equal(parseAmount("1240"), 1240);
  assert.equal(parseAmount("1 240"), 1240);
  assert.equal(parseAmount("1.240"), 1240); // point = milliers, pas 1,24 €
  assert.equal(parseAmount("1.240,50 €"), 1240.5);
  assert.equal(parseAmount("1240,5"), 1240.5);
  assert.equal(parseAmount("12.5"), 12.5);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("-5"), null);
});

test("parseTime : 10:00, 9h30, refuse l'impossible", () => {
  assert.equal(parseTime("10:00"), "10:00");
  assert.equal(parseTime("9h30"), "09:30");
  assert.equal(parseTime("25:00"), null);
  assert.equal(parseTime(""), null);
});

test("dates : addDays traverse le changement d'heure, libellé en français", () => {
  assert.equal(addDays("2026-10-24", 2), "2026-10-26");
  assert.equal(dayLabel("2026-10-02"), "vendredi 2 octobre");
});

test("réponse : sans historique, promet la comparaison au même jour la semaine suivante", () => {
  const msg = replyMessage([], "2026-10-02", 1240, null);
  assert.match(msg, /^Noté ✅ Vendredi : 1[\s  ]240 €\./);
  assert.match(msg, /dès vendredi prochain/);
  assert.doesNotMatch(msg, /Ticket moyen/);
});

test("réponse : compare à la moyenne des mêmes jours, ignore fermé et sans réponse", () => {
  const entries = [
    e("2026-09-25", "repondu", 1000),
    e("2026-09-18", "historique", 1200),
    e("2026-09-11", "sans_reponse"),
    e("2026-09-04", "ferme"),
  ];
  const msg = replyMessage(entries, "2026-10-02", 1210, 100);
  assert.match(msg, /\+10 % par rapport à la moyenne de tes 2 derniers vendredis/);
  assert.match(msg, /Ticket moyen : 12,10 € \(100 tickets\)/);
});

test("réponse : semaine en cours comparée seulement si la semaine d'avant est complète", () => {
  // lundi 28/9 → mercredi 30/9 ; semaine d'avant 21–23/9 complète
  const base = [
    e("2026-09-21", "repondu", 100), e("2026-09-22", "repondu", 100), e("2026-09-23", "repondu", 100),
    e("2026-09-28", "repondu", 110), e("2026-09-29", "relance", 110),
  ];
  assert.match(replyMessage(base, "2026-09-30", 110, null), /Semaine en cours : 330 € sur 3 jours \(\+10 % vs la semaine dernière/);
  const holed = base.filter((x) => x.sales_day !== "2026-09-22");
  assert.doesNotMatch(replyMessage(holed, "2026-09-30", 110, null), /vs la semaine dernière/);
});

test("test : 14 jours depuis le premier jour noté hors historique, jours à noter", () => {
  const entries = [
    e("2026-09-01", "historique", 900),
    e("2026-10-01", "repondu", 1000, { replied_at: "10:20" }),
    e("2026-10-02", "relance", 1100, { replied_at: "15:40" }),
    e("2026-10-03", "ferme"),
  ];
  const s = testStats(entries, "2026-10-06");
  assert.equal(s.start, "2026-10-01");
  assert.equal(s.days.length, 14);
  assert.equal(s.elapsed, 5); // 1→5 octobre
  assert.deepEqual(s.toNote, ["2026-10-04", "2026-10-05"]);
  assert.equal(s.open, 2);
  assert.equal(s.answered, 2);
  assert.equal(s.firstTry, 1);
  assert.equal(s.medianDelayMin, 20); // médiane basse de [20, 340]
});

test("verdict : objectif 10 sur 14, pas de conclusion avant 4 jours ouverts", () => {
  assert.equal(verdictFor(0, 0, false).tone, "neutral");
  assert.equal(verdictFor(3, 3, false).tone, "neutral");
  assert.equal(verdictFor(14, 10, true).tone, "good");
  assert.match(verdictFor(14, 10, true).text, /Test réussi/);
  assert.equal(verdictFor(14, 9, true).tone, "warn");
  assert.equal(verdictFor(10, 4, false).tone, "bad");
});

test("récap du lundi : jours remplis sur jours ouverts, jours qui manquent", () => {
  const entries = [
    e("2026-09-28", "ferme"),
    e("2026-09-29", "repondu", 1000),
    e("2026-09-30", "sans_reponse"),
    e("2026-10-01", "relance", 1200),
  ];
  const msg = weeklyRecap(entries, "2026-10-05", "Houba");
  assert.match(msg, /2 jours sur 3 remplis\. Il manque mercredi\./);
  assert.match(msg, /CA total des jours remplis : 2[\s  ]200 €/);
});
