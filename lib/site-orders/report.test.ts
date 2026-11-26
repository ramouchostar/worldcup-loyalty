import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGIN_REQUIRED } from "./account";
import { CARD_REASONS, OUTAGE_REASONS, RESCUE_REASON } from "./nina-alerts";
import type { OrderLine, OrderStatus } from "./order";
import {
  JOINED_BY_ORDER_MINUTES, REPORT_REASONS, TOP_DISHES, buildWeeklyReport, reportWindow,
  type ReportMembership, type ReportOrder, type ReportRefusal,
} from "./report";

// Jeudi 26 novembre 2026, 15 h à Bruxelles (UTC+1) : la fenêtre va du vendredi 20 au jeudi 26.
const NOW = new Date("2026-11-26T14:00:00.000Z");
const line = (articleId: string, qty: number, name = `Plat ${articleId}`): OrderLine => ({ articleId, name, qty, cents: 100 * qty, zone: null, details: [] });
let n = 0;
const order = (createdAt: string, status: OrderStatus = "retiree", o: Partial<ReportOrder> = {}): ReportOrder => ({
  id: String(++n), status, createdAt, readyAt: null, totalCents: 1000, lines: [], memberId: null, ...o,
});
const report = (orders: ReportOrder[], refusals: ReportRefusal[] = [], memberships: ReportMembership[] | null = []) =>
  buildWeeklyReport({ orders, refusals, memberships, now: NOW });

test("la fenêtre : sept jours belges, aujourd'hui compris, depuis minuit à Bruxelles", () => {
  assert.deepEqual(reportWindow(NOW), { fromDay: "2026-11-20", toDay: "2026-11-26", sinceIso: "2026-11-19T23:00:00.000Z" });
});

test("la fenêtre reste juste à travers le changement d'heure (dernier dimanche de mars)", () => {
  // Le 31 mars 2027 est en été (UTC+2) ; le 25, six jours avant, encore en hiver (UTC+1).
  const w = reportWindow(new Date("2027-03-31T10:00:00.000Z"));
  assert.deepEqual(w, { fromDay: "2027-03-25", toDay: "2027-03-31", sinceIso: "2027-03-24T23:00:00.000Z" });
});

test("aucune commande : des zéros et des « pas mesuré », jamais une moyenne inventée", () => {
  const r = report([]);
  assert.equal(r.received, 0);
  assert.equal(r.pickedUpCents, 0);
  assert.equal(r.avgReadyMinutes, null);
  assert.equal(r.newMembers, 0);
  assert.deepEqual(r.topDishes, []);
  assert.deepEqual(r.hours, []);
  assert.deepEqual(r.problems, []);
});

test("reçues, retirées, annulées ; le total ne compte que les retirées", () => {
  const r = report([
    order("2026-11-25T11:00:00Z", "retiree", { totalCents: 1250 }),
    order("2026-11-25T11:05:00Z", "retiree", { totalCents: 800 }),
    order("2026-11-26T13:59:00Z", "recue", { totalCents: 999 }),
    order("2026-11-24T11:00:00Z", "annulee", { totalCents: 5000 }),
  ]);
  assert.deepEqual([r.received, r.pickedUp, r.cancelled, r.pickedUpCents], [4, 2, 1, 2050]);
});

test("une commande d'avant la fenêtre ne compte pas, même rendue par la lecture", () => {
  const r = report([order("2026-11-19T22:59:00Z"), order("2026-11-19T23:00:00Z")]);
  assert.equal(r.received, 1);
});

test("le délai moyen ne porte que sur les commandes passées « prêtes »", () => {
  const r = report([
    order("2026-11-25T11:00:00Z", "retiree", { readyAt: "2026-11-25T11:10:00Z" }),
    order("2026-11-25T12:00:00Z", "retiree", { readyAt: "2026-11-25T12:21:00Z" }),
    order("2026-11-25T13:00:00Z", "annulee"),
  ]);
  assert.equal(r.avgReadyMinutes, 16); // (10 + 21) / 2 = 15,5 arrondi
});

test("les plats : par quantité, les annulées écartées, le nom le plus récent, trois au plus", () => {
  const r = report([
    order("2026-11-24T11:00:00Z", "retiree", { lines: [line("a", 1, "Ancien nom"), line("b", 2), line("c", 1), line("d", 1)] }),
    order("2026-11-25T11:00:00Z", "retiree", { lines: [line("a", 4, "Nouveau nom")] }),
    order("2026-11-25T12:00:00Z", "annulee", { lines: [line("d", 50)] }),
  ]);
  assert.equal(r.topDishes.length, TOP_DISHES);
  assert.deepEqual(r.topDishes, [{ name: "Nouveau nom", qty: 5 }, { name: "Plat b", qty: 2 }, { name: "Plat c", qty: 1 }]);
});

test("les heures de pointe sont belges, continues entre la première et la dernière, sans les annulées", () => {
  const r = report([
    order("2026-11-24T10:15:00Z"), // 11 h à Bruxelles
    order("2026-11-25T10:45:00Z"), // 11 h
    order("2026-11-25T12:00:00Z"), // 13 h
    order("2026-11-25T20:00:00Z", "annulee"), // 21 h, écartée
  ]);
  assert.deepEqual(r.hours, [{ hour: 11, count: 2 }, { hour: 12, count: 0 }, { hour: 13, count: 1 }]);
});

test("nouveaux membres venus par l'espace : adhésion créée juste APRÈS une commande, comptée une fois", () => {
  const at = "2026-11-25T11:00:00.000Z";
  const plus = (min: number) => new Date(Date.parse(at) + min * 60000).toISOString();
  const orders = [
    order(at, "retiree", { memberId: "neuf" }),
    order("2026-11-26T11:00:00Z", "retiree", { memberId: "neuf" }),
    order(at, "annulee", { memberId: "neuf-annule" }),
    order(at, "retiree", { memberId: "par-qr" }),
    order(at, "retiree", { memberId: "ancien" }),
    order(at, "retiree", { memberId: "trop-tard" }),
    order(at, "retiree"),
  ];
  const memberships: ReportMembership[] = [
    { userId: "neuf", joinedAt: plus(0.01) },
    { userId: "neuf-annule", joinedAt: plus(1) },
    { userId: "par-qr", joinedAt: plus(-2) }, // entré avant de commander : pas venu par l'espace
    { userId: "ancien", joinedAt: "2026-01-04T08:00:00Z" },
    { userId: "trop-tard", joinedAt: plus(JOINED_BY_ORDER_MINUTES + 1) },
    { userId: "sans-commande", joinedAt: plus(1) },
  ];
  assert.equal(report(orders, [], memberships).newMembers, 2);
});

test("sans le lien commande-compte, les nouveaux membres ne se mesurent pas (null, jamais zéro)", () => {
  assert.equal(report([order("2026-11-25T11:00:00Z")], [], null).newMembers, null);
});

test("une panne n'est « réglée » que si une commande est passée après le dernier échec", () => {
  const refusals: ReportRefusal[] = [
    { reason: OUTAGE_REASONS[0], createdAt: "2026-11-24T11:00:00Z" },
    { reason: OUTAGE_REASONS[0], createdAt: "2026-11-24T11:02:00Z" },
    { reason: OUTAGE_REASONS[0], createdAt: "2026-11-26T13:00:00Z" },
  ];
  const r = report([order("2026-11-25T11:00:00Z")], refusals);
  assert.deepEqual(r.problems, [
    { day: "2026-11-26", state: "a_verifier", text: "1 envoi a échoué : un souci de notre côté" },
    { day: "2026-11-24", state: "regle", text: "2 envois ont échoué : un souci de notre côté" },
  ]);
});

test("refus de carte et secours WhatsApp : « à vérifier », jamais « réglé » (rien ne le prouve)", () => {
  const r = report([order("2026-11-26T13:30:00Z")], [
    { reason: "plat_indisponible", createdAt: "2026-11-25T11:00:00Z" },
    { reason: "plat_indisponible", createdAt: "2026-11-25T11:05:00Z" },
    { reason: RESCUE_REASON, createdAt: "2026-11-24T11:00:00Z" },
  ]);
  assert.deepEqual(r.problems.map((p) => [p.day, p.state]), [["2026-11-25", "a_verifier"], ["2026-11-24", "a_verifier"]]);
  assert.equal(r.problems[0].text, "2 envois refusés : plat indisponible");
  assert.match(r.problems[1].text, /^Secours WhatsApp proposé 1 fois/);
});

test("chaque motif de carte a un libellé lisible", () => {
  for (const reason of CARD_REASONS) {
    const [p] = report([], [{ reason, createdAt: "2026-11-25T11:00:00Z" }]).problems;
    assert.match(p.text, /^1 envoi refusé : [^_]+$/);
    assert.doesNotMatch(p.text, /undefined/);
  }
});

test("les motifs qui ne sont pas des problèmes sont ignorés (connexion demandée, saisie du client)", () => {
  for (const reason of [LOGIN_REQUIRED.reason, "prenom", "whatsapp_touche"]) assert.ok(!REPORT_REASONS.includes(reason), reason);
  assert.deepEqual(report([], [{ reason: LOGIN_REQUIRED.reason, createdAt: "2026-11-25T11:00:00Z" }]).problems, []);
});

test("commandes restées en route : « à régler » ; une commande fraîche n'est pas un problème", () => {
  const r = report([
    order("2026-11-24T11:00:00Z", "recue"),
    order("2026-11-25T08:00:00Z", "prete", { readyAt: "2026-11-25T08:15:00Z" }),
    order("2026-11-25T08:30:00Z", "prete", { readyAt: "2026-11-25T08:45:00Z" }),
    order("2026-11-26T13:55:00Z", "recue"), // 5 minutes : normal
    order("2026-11-26T13:00:00Z", "prete", { readyAt: "2026-11-26T13:20:00Z" }), // 40 minutes : normal
  ]);
  assert.deepEqual(r.problems, [
    { day: "2026-11-25", state: "a_regler", text: "2 commandes prêtes, ni retirées ni annulées" },
    { day: "2026-11-24", state: "a_regler", text: "1 commande jamais marquée « prête »" },
  ]);
});

test("dans une même journée, ce qui demande un geste passe avant le reste", () => {
  const r = report(
    [order("2026-11-24T09:00:00Z", "recue"), order("2026-11-25T11:00:00Z")],
    [{ reason: OUTAGE_REASONS[0], createdAt: "2026-11-24T10:00:00Z" }, { reason: "choix_invalide", createdAt: "2026-11-24T10:00:00Z" }],
  );
  assert.deepEqual(r.problems.map((p) => p.state), ["a_regler", "a_verifier", "regle"]);
});
