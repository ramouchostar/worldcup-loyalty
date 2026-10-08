import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "./console-journey";
import {
  activeDays,
  BASELINE_DAYS,
  etaLabel,
  baseline,
  buildGrowthView,
  growthStage,
  machineEta,
  mondayOf,
  replayLevel,
  salesByDay,
  steps,
  weeklyAverages,
  type DailySales,
} from "./growth-game";

// Fabrique `n` jours notés consécutifs à partir de `from`, au montant donné.
function days(from: string, n: number, amount: number | ((i: number) => number)): DailySales {
  const out: DailySales = {};
  for (let i = 0; i < n; i++) out[addDays(from, i)] = typeof amount === "number" ? amount : amount(i);
  return out;
}

test("étape : il faut les DEUX seuils pour passer au chiffre", () => {
  assert.equal(growthStage({ tickets90: 100, contacts90: 199 }), "machine");
  assert.equal(growthStage({ tickets90: 99, contacts90: 500 }), "machine");
  assert.equal(growthStage({ tickets90: 100, contacts90: 200 }), "chiffre");
});

test("date estimée : la jauge la plus lente décide, rien si l'une n'avance pas", () => {
  // 36 tickets manquants à 2/jour = 18 j ; 69 contacts à 3/jour = 23 j.
  assert.equal(machineEta({ tickets90: 64, contacts90: 131, ticketsWeek: 14, contactsWeek: 21 }), 23);
  assert.equal(machineEta({ tickets90: 64, contacts90: 131, ticketsWeek: 14, contactsWeek: 0 }), null);
});

test("rythme : mesuré depuis le démarrage s'il a moins de 7 jours", () => {
  assert.equal(activeDays(null, "2026-10-08"), 7);
  assert.equal(activeDays("2026-06-11", "2026-10-08"), 7);
  assert.equal(activeDays("2026-10-08", "2026-10-08"), 1);
  assert.equal(activeDays("2026-10-06", "2026-10-08"), 3);
});

test("date estimée : De Bue lancé aujourd'hui, 12 tickets et 17 contacts → 11 jours, pas fin décembre", () => {
  const base = { tickets90: 12, contacts90: 17, ticketsWeek: 12, contactsWeek: 17 };
  assert.equal(machineEta(base), 76); // l'ancien calcul (÷ 7) : vers le 23 décembre
  assert.equal(machineEta({ ...base, ticketsDays: 1, contactsDays: 1 }), 11);
  const v = buildGrowthView({ today: "2026-10-08", ...base, firstTicketDay: "2026-10-08", firstContactDay: "2026-10-08", sales: {} });
  if (v.stage !== "machine") throw new Error("étape 1 attendue");
  assert.equal(v.eta, 11);
});

test("délai : dit en jours, puis en semaines", () => {
  assert.equal(etaLabel(1), "dès demain");
  assert.equal(etaLabel(11), "dans 11 jours");
  assert.equal(etaLabel(22), "dans environ 4 semaines");
});

test("ventes : les lignes d'un même jour s'additionnent", () => {
  const s = salesByDay([
    { sold_on: "2026-10-01", amount: 12.5 },
    { sold_on: "2026-10-01", amount: 7.5 },
    { sold_on: "2026-10-02", amount: 300 },
  ]);
  assert.deepEqual(s, { "2026-10-01": 20, "2026-10-02": 300 });
});

test("départ : moyenne des 28 PREMIERS jours notés, rien avant 28", () => {
  assert.equal(baseline(days("2026-09-01", BASELINE_DAYS - 1, 350)), null);
  const s = { ...days("2026-09-01", BASELINE_DAYS, 350), ...days("2026-10-01", 10, 900) };
  const b = baseline(s);
  assert.equal(b?.amount, 350); // les jours suivants ne bougent pas le départ
  assert.equal(b?.lastDay, "2026-09-28");
});

test("paliers : marche fixe de 5 % du départ arrondie à 10 €, cinq paliers", () => {
  assert.deepEqual(steps(350), [370, 390, 410, 430, 450]);
  assert.deepEqual(steps(1177.56), [1240, 1300, 1360, 1420, 1480]);
  assert.deepEqual(steps(90), [100, 110, 120, 130, 140]);
});

test("semaines : du lundi au dimanche", () => {
  assert.equal(mondayOf("2026-10-08"), "2026-10-05"); // jeudi
  assert.equal(mondayOf("2026-10-11"), "2026-10-05"); // dimanche
  assert.equal(mondayOf("2026-10-12"), "2026-10-12"); // lundi
  const w = weeklyAverages({ "2026-10-05": 300, "2026-10-06": 400, "2026-10-12": 500 }, "2026-10-01", "2026-10-20");
  assert.deepEqual(w, [
    { monday: "2026-10-05", days: 2, avg: 350 },
    { monday: "2026-10-12", days: 1, avg: 500 },
  ]);
});

test("niveau : 3 semaines sur 4 au-dessus du palier pour monter", () => {
  const wk = (avg: number, monday = "2026-10-05") => ({ monday, days: 6, avg });
  assert.equal(replayLevel([370, 390], [wk(380), wk(360), wk(375)]).level, 0);
  assert.equal(replayLevel([370, 390], [wk(380), wk(360), wk(375), wk(371)]).level, 1);
});

test("niveau : jamais perdu, et le compte repart à zéro après un passage", () => {
  const wk = (avg: number) => ({ monday: "2026-10-05", days: 6, avg });
  const r = replayLevel([370, 390], [wk(380), wk(380), wk(380), wk(300), wk(300), wk(300)]);
  assert.equal(r.level, 1); // trois semaines à 300 ne font pas redescendre
  assert.equal(r.recent.length, 3);
  assert.equal(r.recent.every((x) => x.target === 390 && !x.held), true);
});

test("niveau : une semaine à moins de 3 jours notés ne compte pas", () => {
  const r = replayLevel([370], [
    { monday: "a", days: 2, avg: 999 },
    { monday: "b", days: 2, avg: 999 },
    { monday: "c", days: 2, avg: 999 },
  ]);
  assert.equal(r.level, 0);
  assert.equal(r.recent.length, 0);
});

test("vue : étape 1 tant que la machine n'est pas lancée", () => {
  const v = buildGrowthView({ today: "2026-10-08", tickets90: 64, contacts90: 131, ticketsWeek: 14, contactsWeek: 21, sales: {} });
  assert.equal(v.stage, "machine");
  if (v.stage === "machine") assert.equal(v.eta, 23);
});

test("vue : étape 2 sans 28 jours notés → on pousse la saisie", () => {
  const v = buildGrowthView({ today: "2026-10-08", tickets90: 120, contacts90: 210, ticketsWeek: 14, contactsWeek: 21, sales: days("2026-09-20", 9, 350) });
  assert.equal(v.stage, "chiffre");
  if (v.stage === "chiffre") {
    assert.equal(v.game, null);
    assert.equal(v.notedDays, 9);
  }
});

test("vue : de bout en bout — départ 350, un palier gagné, la semaine en cours", () => {
  // 28 jours à 350 du 2026-08-03 (lundi) au 2026-08-30, puis trois semaines à
  // 380 (palier 370 tenu), puis une semaine à 395, et la semaine en cours.
  const sales: DailySales = {
    ...days("2026-08-03", 28, 350),
    ...days("2026-08-31", 21, 380),
    ...days("2026-09-21", 7, 395),
    ...days("2026-10-05", 3, 384),
  };
  const v = buildGrowthView({ today: "2026-10-07", tickets90: 312, contacts90: 486, ticketsWeek: 26, contactsWeek: 31, sales });
  assert.equal(v.stage, "chiffre");
  if (v.stage !== "chiffre" || !v.game) throw new Error("jeu attendu");
  const g = v.game;
  assert.equal(g.depart, 350);
  assert.equal(g.level, 2);
  assert.equal(g.target, 390);
  assert.deepEqual(g.current, { avg: 384, days: 3, thisWeek: true });
  assert.equal(g.gap, 6);
  assert.equal(g.heldWeeks, 1); // 395 tient 390 ; la semaine du 28/09 n'est pas notée
  assert.equal(g.cap, 450);
});
