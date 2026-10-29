import { test } from "node:test";
import assert from "node:assert/strict";
import { CAISSE, PLATEFORMES, blockTotal, channelsNote, dayFeedback, isEditableDay, missingDays, parseEntry, shortDayLabel } from "./daily-revenue-entry";
import type { DailyEntry } from "./daily-revenue-model";

const entry = (sales_day: string, amount: number | null, outcome: DailyEntry["outcome"] = "saisi"): DailyEntry => ({
  sales_day,
  outcome,
  amount,
  tickets: null,
  asked_at: null,
  replied_at: null,
  note: null,
});

const blank = { closed: false, channels: {}, orders: "" };

test("parseEntry : caisse + plateformes, les vides ignorés", () => {
  const r = parseEntry({ ...blank, channels: { carte: "812,40", cash: "236", internet: "58", uber: "266", deliveroo: "94,5" }, orders: "57" });
  assert.deepEqual(r, {
    ok: true,
    closed: false,
    amount: 1466.9,
    tickets: 57,
    channels: { carte: 812.4, cash: 236, internet: 58, uber: 266, deliveroo: 94.5, takeaway: null },
  });
});

test("parseEntry : un seul bloc suffit, milliers belges compris", () => {
  const r = parseEntry({ ...blank, channels: { carte: "1.527,50" } });
  assert.equal(r.ok && !r.closed && r.amount, 1527.5);
});

test("blockTotal : sous-totaux caisse et plateformes", () => {
  const ch = { carte: 800, cash: 200, internet: null, uber: 100, deliveroo: null, takeaway: 50.5 };
  assert.equal(blockTotal(ch, CAISSE), 1000);
  assert.equal(blockTotal(ch, PLATEFORMES), 150.5);
});

test("parseEntry : fermé ne demande rien d'autre", () => {
  assert.deepEqual(parseEntry({ ...blank, closed: true, channels: { carte: "abc" } }), { ok: true, closed: true });
});

test("parseEntry : refus parlants", () => {
  assert.equal(parseEntry(blank).ok, false);
  const bad = parseEntry({ ...blank, channels: { uber: "deux cents" } });
  assert.ok(!bad.ok && bad.error.startsWith("Uber Eats"));
  assert.equal(parseEntry({ ...blank, channels: { cash: "0" } }).ok, false); // 0 € ouvert → « fermé »
  assert.equal(parseEntry({ ...blank, channels: { carte: "250000" } }).ok, false);
  assert.equal(parseEntry({ ...blank, channels: { carte: "1200" }, orders: "12,5" }).ok, false);
});

test("parseEntry : 0 commande = non renseigné", () => {
  const r = parseEntry({ ...blank, channels: { carte: "900" }, orders: "0" });
  assert.equal(r.ok && !r.closed && r.tickets, null);
});

test("channelsNote : le détail lisible pour le repli sans colonnes", () => {
  assert.equal(channelsNote({ carte: 812, cash: null, internet: null, uber: 266, deliveroo: null, takeaway: 112 }), "Par canal : Carte 812 · Uber Eats 266 · Takeaway 112");
  assert.equal(channelsNote(null), null);
});

test("isEditableDay : aujourd'hui et les 13 jours d'avant, jamais demain", () => {
  assert.equal(isEditableDay("2026-10-24", "2026-10-24"), true);
  assert.equal(isEditableDay("2026-10-11", "2026-10-24"), true);
  assert.equal(isEditableDay("2026-10-10", "2026-10-24"), false);
  assert.equal(isEditableDay("2026-10-25", "2026-10-24"), false);
  assert.equal(isEditableDay("pas-une-date", "2026-10-24"), false);
});

test("missingDays : les 7 jours avant aujourd'hui, hier d'abord", () => {
  const covered = new Set(["2026-10-23", "2026-10-21", "2026-10-17"]);
  assert.deepEqual(missingDays(covered, "2026-10-24"), ["2026-10-22", "2026-10-20", "2026-10-19", "2026-10-18"]);
});

test("shortDayLabel", () => {
  assert.equal(shortDayLabel("2026-10-26"), "lundi 26");
});

test("dayFeedback : mêmes jours, semaine complète, programme", () => {
  // Vendredi 23/10 ; les vendredis d'avant : 16/10, 9/10.
  const entries = [
    entry("2026-10-09", 1300),
    entry("2026-10-16", 1460),
    // Semaine d'avant, lundi 12 → vendredi 16 : complète.
    entry("2026-10-12", 1000),
    entry("2026-10-13", 1000),
    entry("2026-10-14", 1000),
    entry("2026-10-15", 1180),
    // Semaine en cours, lundi 19 → jeudi 22.
    entry("2026-10-19", 1100),
    entry("2026-10-20", 1100),
    entry("2026-10-21", 1100),
    entry("2026-10-22", 1233),
  ];
  const f = dayFeedback(entries, "2026-10-23", 1527, 57, { amount: 76, tickets: 4 });
  assert.equal(f.sameDays?.n, 2);
  assert.equal(f.sameDays?.avg, 1380);
  assert.equal(f.sameDays?.pct, 11);
  assert.equal(f.sameDays?.unusual, false);
  assert.equal(f.week.sum, 6060);
  assert.equal(f.week.prevSum, 5640);
  assert.equal(f.week.pct, 7);
  assert.equal(f.week.unusual, false);
  assert.equal(f.averageTicket, 26.79);
  assert.deepEqual(f.program, { tickets: 4, amount: 76, penetrationPct: 5, orderSharePct: 7, orders: 57 });
});

test("dayFeedback : écart inhabituel au-delà de ±25 % sur le jour, ±15 % sur la semaine", () => {
  const entries = [entry("2026-10-06", 1000), entry("2026-10-13", 1000), entry("2026-10-12", 1000), entry("2026-10-19", 1000)];
  const f = dayFeedback(entries, "2026-10-20", 700, null, { amount: 0, tickets: 0 });
  assert.equal(f.sameDays?.pct, -30);
  assert.equal(f.sameDays?.unusual, true);
  assert.equal(f.week.pct, -15);
  assert.equal(f.week.unusual, true);
  assert.equal(f.program.orderSharePct, null);
  assert.equal(f.averageTicket, null);
});

test("dayFeedback : semaine trouée → pas de comparaison, le jour saisi n'est pas compté deux fois", () => {
  const entries = [entry("2026-10-19", 1000), entry("2026-10-21", 900, "spontane"), entry("2026-10-12", 1000)];
  const f = dayFeedback(entries, "2026-10-21", 950, null, { amount: 0, tickets: 0 });
  assert.equal(f.week.sum, 1950);
  assert.equal(f.week.days, 2);
  assert.equal(f.week.pct, null);
  assert.equal(f.sameDays, null);
});

test("dayFeedback : un jour fermé ou sans réponse ne compte pas comme un chiffre", () => {
  const entries = [entry("2026-10-16", null, "ferme"), entry("2026-10-09", null, "sans_reponse"), entry("2026-10-02", 1200)];
  const f = dayFeedback(entries, "2026-10-23", 1200, null, { amount: 0, tickets: 0 });
  assert.equal(f.sameDays?.n, 1);
  assert.equal(f.sameDays?.pct, 0);
});
