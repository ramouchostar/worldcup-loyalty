import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clientNumbers,
  clientStats,
  parseStatsPeriod,
  revenueStats,
  shareSentence,
  statsHeadline,
  statsPeriod,
  topDishes,
  type StatsTicket,
} from "./stats-page";

test("période : ce mois = du 1er à aujourd'hui, comparé aux mêmes jours du mois d'avant", () => {
  const p = statsPeriod("mois", "2026-11-09", "2026-06-11");
  assert.deepEqual(p.current, { from: "2026-11-01", to: "2026-11-09" });
  assert.deepEqual(p.previous, { from: "2026-10-01", to: "2026-10-09" });
  assert.equal(p.compareName, "octobre");
  assert.equal(p.label, "du 1er au 9 novembre");
});

test("période : le 31 mars se compare au 28 février, jamais à un jour qui n'existe pas", () => {
  const p = statsPeriod("mois", "2027-03-31", null);
  assert.deepEqual(p.previous, { from: "2027-02-01", to: "2027-02-28" });
});

test("période : mois dernier = le mois entier, comparé au mois d'avant entier", () => {
  const p = statsPeriod("mois-dernier", "2026-11-14", null);
  assert.deepEqual(p.current, { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(p.previous, { from: "2026-09-01", to: "2026-09-30" });
  assert.equal(p.compareName, "septembre");
  // Janvier : le mois dernier est décembre de l'année d'avant.
  assert.deepEqual(statsPeriod("mois-dernier", "2027-01-05", null).current, { from: "2026-12-01", to: "2026-12-31" });
});

test("période : depuis le début n'a pas de comparaison", () => {
  const p = statsPeriod("debut", "2026-11-14", "2026-06-11");
  assert.deepEqual(p.current, { from: "2026-06-11", to: "2026-11-14" });
  assert.equal(p.previous, null);
  assert.equal(p.label, "depuis le 11 juin 2026");
  assert.equal(parseStatsPeriod("n'importe quoi"), "mois");
  assert.equal(parseStatsPeriod("debut"), "debut");
});

const t = (userId: string, day: string, amount = 20): StatsTicket => ({ userId, day, amount });

test("clients : nouveau = premier ticket dans la période ; revenu = deux jours différents", () => {
  const tickets = [
    t("a", "2026-10-03"), // ancien client
    t("a", "2026-11-02"), // revient en novembre → revenu
    t("b", "2026-11-03"),
    t("b", "2026-11-03"), // deux tickets le même jour → pas « revenu »
    t("c", "2026-11-04"),
    t("c", "2026-11-08"), // nouveau ET revenu
    t("d", "2026-11-20"), // après la période : ignoré
  ];
  const n = clientNumbers(tickets, { from: "2026-11-01", to: "2026-11-09" });
  assert.equal(n.tickets, 5);
  assert.equal(n.clients, 3);
  assert.equal(n.newClients, 2);
  assert.equal(n.returningPct, 67);
});

test("clients : pas de « +N vs octobre » quand octobre n'a aucun ticket", () => {
  const s = clientStats([t("a", "2026-11-02")], statsPeriod("mois", "2026-11-09", null), []);
  assert.equal(s.ticketsDelta, null);
});

test("clients : cadeaux récupérés comptés dans la période seulement", () => {
  const s = clientStats([], statsPeriod("mois", "2026-11-09", null), ["2026-10-30", "2026-11-02", "2026-11-09"]);
  assert.equal(s.giftsRedeemed, 2);
});

test("CA : total noté, jours notés, barres sans le jour en cours", () => {
  const days = [
    { day: "2026-11-01", amount: 1000, closed: false },
    { day: "2026-11-02", amount: null, closed: true },
    { day: "2026-11-03", amount: 1200, closed: false },
    { day: "2026-11-09", amount: 900, closed: false }, // aujourd'hui : compté au total, pas dans les barres
  ];
  const r = revenueStats(days, {}, statsPeriod("mois", "2026-11-09", null), "2026-11-09");
  assert.equal(r.total, 3100);
  assert.equal(r.notedDays, 3);
  assert.equal(r.elapsedDays, 8);
  assert.equal(r.bars.length, 8);
  assert.equal(r.bars[1].closed, true);
  assert.equal(r.changePct, null, "moins de 5 jours notés : pas de comparaison");
});

test("CA : comparaison par jour noté et part du programme sur les mêmes jours", () => {
  const days = [];
  const program: Record<string, { amount: number }> = {};
  for (let i = 1; i <= 6; i++) {
    const d = `0${i}`;
    days.push({ day: `2026-10-${d}`, amount: 1000, closed: false });
    days.push({ day: `2026-11-${d}`, amount: 1100, closed: false });
    program[`2026-11-${d}`] = { amount: 220 };
  }
  // Un jour sans CA noté mais avec des tickets : ne gonfle pas la part.
  program["2026-11-07"] = { amount: 5000 };
  const r = revenueStats(days, program, statsPeriod("mois", "2026-11-09", null), "2026-11-09");
  assert.equal(r.changePct, 10);
  assert.equal(r.programSharePct, 20);
});

test("phrase : CA comparé en premier quand il existe", () => {
  const period = statsPeriod("mois", "2026-11-09", null);
  const clients = { tickets: 188, clients: 117, newClients: 19, returningPct: 36, ticketsDelta: 22, returningDeltaPts: 2, giftsRedeemed: 24 };
  const revenue = { total: 1, notedDays: 8, elapsedDays: 8, bars: [], changePct: 8, programSharePct: 21 };
  assert.equal(
    statsHeadline({ period, clients, revenue }),
    "Ton chiffre est en hausse de 8 % sur les mêmes jours, et 1 euro sur 5 vient de tes clients du programme."
  );
});

test("phrase : tickets et clients revenus sans CA comparé", () => {
  const period = statsPeriod("mois", "2026-11-09", null);
  const clients = { tickets: 412, clients: 236, newClients: 31, returningPct: 41, ticketsDelta: 38, returningDeltaPts: 3, giftsRedeemed: 57 };
  assert.equal(
    statsHeadline({ period, clients, revenue: null }),
    "Bon mois : 412 tickets, 38 de plus qu’en octobre. 41 % de tes clients sont revenus."
  );
  assert.equal(
    statsHeadline({ period, clients: { ...clients, ticketsDelta: -4 }, revenue: null }),
    "412 tickets ce mois, 4 de moins qu’en octobre. 41 % de tes clients sont revenus."
  );
  assert.equal(
    statsHeadline({ period, clients: { ...clients, tickets: 0, clients: 0, returningPct: null, ticketsDelta: null }, revenue: null }),
    "Pas encore de ticket ce mois."
  );
});

test("phrase : jamais « grâce à » ni de promesse", () => {
  const period = statsPeriod("mois", "2026-11-09", null);
  const clients = { tickets: 3, clients: 2, newClients: 2, returningPct: 0, ticketsDelta: null, returningDeltaPts: null, giftsRedeemed: 0 };
  const s = statsHeadline({ period, clients, revenue: null });
  assert.equal(s, "3 tickets ce mois. 2 nouveaux clients.");
  assert.doesNotMatch(s, /grâce/i);
});

test("part en clair", () => {
  assert.equal(shareSentence(34), "1 euro sur 3 vient de tes clients du programme");
  assert.equal(shareSentence(7), "7 % de ton chiffre vient de tes clients du programme");
});

test("plats : par quantité, lignes techniques exclues, noms regroupés", () => {
  const top = topDishes([
    { name: "Menu Crispy", quantity: 2 },
    { name: "menu crispy ", quantity: 1 },
    { name: "Wings (6)", quantity: 2 },
    { name: "TVA 6%", quantity: 9, ignored: true },
    { name: "Coca", quantity: 1 },
  ]);
  assert.deepEqual(top, [
    { name: "Menu Crispy", quantity: 3 },
    { name: "Wings (6)", quantity: 2 },
    { name: "Coca", quantity: 1 },
  ]);
});
