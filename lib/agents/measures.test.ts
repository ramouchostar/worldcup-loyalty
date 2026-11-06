import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_DECIDED_FOR_ALERT,
  MIN_HOLDOUT_FOR_EFFECT,
  RETURN_WINDOW_DAYS,
  YES_RATE_ALERT,
  activityMinutes,
  buildReport,
  campaignEffect,
  measureGroup,
  openedDays,
  timeSpent,
  type MeasureRow,
} from "./measures";
import { ASSISTANTS } from "./types";

const DAY = "2026-11-04";
const at = (hhmm: string, day = DAY) => `${day}T${hhmm}:00Z`;

function row(over: Partial<MeasureRow> = {}): MeasureRow {
  return {
    restaurant_id: "r1",
    assistant: "hugo",
    type: "clients_a_relancer",
    origin: "systeme",
    status: "proposee",
    proposed_on: DAY,
    created_at: at("08:00"),
    seen_at: null,
    decided_at: null,
    snooze_count: 0,
    refusal_reason: null,
    refusal_note: null,
    discard_reason: null,
    execution_error: null,
    executed_at: null,
    ...over,
  };
}

const many = (n: number, over: Partial<MeasureRow>) => Array.from({ length: n }, () => row(over));

// ─── Un groupe d'idées ────────────────────────────────────────────────────────

test("les idées se comptent par sort : montrées, décidées, Oui, Non, expirées, ouvertes, écartées par raison", () => {
  const m = measureGroup([
    row({ status: "executee", decided_at: at("09:00") }),
    row({ status: "executee", decided_at: at("09:00") }),
    row({ status: "acceptee", decided_at: at("09:00") }), // Oui qui attend l'équipe
    row({ status: "acceptee", decided_at: at("09:00"), execution_error: "Pub fermée" }), // Oui en échec
    row({ status: "refusee", decided_at: at("09:00"), refusal_reason: "trop_cher" }),
    row({ status: "refusee", decided_at: at("09:00"), refusal_reason: "trop_cher", refusal_note: "hors budget" }),
    row({ status: "refusee", decided_at: at("09:00"), refusal_reason: "deja_fait" }),
    row({ status: "expiree" }),
    row({ status: "proposee" }),
    row({ status: "ecartee", discard_reason: "plafond_du_jour" }),
    row({ status: "ecartee", discard_reason: "appris" }),
  ]);
  assert.equal(m.produced, 11);
  assert.equal(m.shown, 9); // les écartées ne sont jamais montrées
  assert.deepEqual(m.discarded, { plafond_du_jour: 1, appris: 1 });
  assert.equal(m.decided, 7);
  assert.equal(m.yes, 4);
  assert.equal(m.no, 3);
  assert.equal(m.expired, 1);
  assert.equal(m.open, 1);
  assert.deepEqual(m.refusals, { trop_cher: 2, deja_fait: 1 });
  assert.equal(m.refusalNotes, 1);
  assert.equal(m.failedExecutions, 1);
  assert.equal(m.awaitingTeam, 1);
  assert.equal(m.yesRate, 4 / 7);
  assert.equal(m.decidedShare, 7 / 8); // 7 décidées sur 8 closes ; l'idée encore ouverte n'entre pas dans la part
});

test("un groupe vide ne ment pas : des null, jamais des zéros qui ressemblent à des mesures", () => {
  const m = measureGroup([]);
  assert.equal(m.shown, 0);
  assert.equal(m.yesRate, null);
  assert.equal(m.decidedShare, null);
  assert.equal(m.medianDecisionHours, null);
  assert.equal(m.yesRateAlert, false);
});

test("l'alerte « taux de Oui sous 30 % » n'existe que sur un échantillon qui permet de juger", () => {
  assert.equal(YES_RATE_ALERT, 0.3);
  assert.equal(MIN_DECIDED_FOR_ALERT, 10);
  const refus = (n: number) => many(n, { status: "refusee", decided_at: at("09:00"), refusal_reason: "pas_le_moment" });
  const oui = (n: number) => many(n, { status: "executee", decided_at: at("09:00") });

  // 2 Oui sur 10 = 20 % : alerte.
  const bad = measureGroup([...oui(2), ...refus(8)]);
  assert.equal(bad.yesRate, 0.2);
  assert.equal(bad.yesRateAlert, true);
  // 1 Oui sur 9 : même pourcentage dégradé, mais 9 décisions ne suffisent pas à juger.
  const few = measureGroup([...oui(1), ...refus(8)]);
  assert.equal(few.tooFewToJudge, true);
  assert.equal(few.yesRateAlert, false);
  // Exactement 30 % n'alerte pas (« sous » 30 %).
  const edge = measureGroup([...oui(3), ...refus(7)]);
  assert.equal(edge.yesRate, 0.3);
  assert.equal(edge.yesRateAlert, false);
});

test("le délai de décision est la médiane, en heures, entre la production de l'idée et le choix", () => {
  const m = measureGroup([
    row({ status: "executee", created_at: at("08:00"), decided_at: at("09:00") }), // 1 h
    row({ status: "refusee", created_at: at("08:00"), decided_at: at("11:00"), refusal_reason: "autre" }), // 3 h
    row({ status: "acceptee", created_at: at("08:00"), decided_at: at("18:00") }), // 10 h
    row({ status: "expiree", created_at: at("08:00") }), // jamais décidée : hors du délai
  ]);
  assert.equal(m.medianDecisionHours, 3);
});

test("« Plus tard » est compté ; les idées préparées à la main par l'équipe aussi, écartées comprises", () => {
  const m = measureGroup([
    row({ snooze_count: 2 }),
    row({ snooze_count: 1, origin: "equipe" }),
    row({ status: "ecartee", discard_reason: "forfait", origin: "equipe" }),
  ]);
  assert.equal(m.snoozes, 3);
  assert.equal(m.fromTeam, 2);
});

// ─── Les jours où le gérant ouvre ses idées ───────────────────────────────────

test("part des jours ouverts : une vue sur l'une des idées du jour suffit, les écartées ne comptent pas", () => {
  const d = openedDays([
    row({ proposed_on: "2026-11-03", seen_at: at("09:05", "2026-11-03") }),
    row({ proposed_on: "2026-11-03" }), // même jour : déjà ouvert
    row({ proposed_on: "2026-11-04" }), // jamais vu
    row({ proposed_on: "2026-11-05", status: "ecartee", discard_reason: "plafond_du_jour" }), // pas montrée : pas un jour
    row({ restaurant_id: "r2", proposed_on: "2026-11-04", seen_at: at("10:00") }),
  ]);
  assert.equal(d.withIdeas, 3);
  assert.equal(d.opened, 2);
  assert.equal(d.share, 2 / 3);
  assert.equal(openedDays([]).share, null);
});

// ─── Le temps passé, estimé ───────────────────────────────────────────────────

test("durée d'activité : les événements proches font une visite, un grand écart en fait deux", () => {
  const t = (hhmm: string) => Date.parse(at(hhmm));
  assert.equal(activityMinutes([]), 0);
  assert.equal(activityMinutes([t("09:00")]), 0); // une seule trace : aucune durée mesurable
  assert.equal(activityMinutes([t("09:00"), t("09:02"), t("09:04")]), 4);
  // 09:00–09:03 (3 min), puis 09:30–09:31 (1 min) : 25 minutes de silence ne comptent pas.
  assert.equal(activityMinutes([t("09:30"), t("09:00"), t("09:31"), t("09:03")]), 4);
  // Exactement 10 minutes d'écart : encore la même visite.
  assert.equal(activityMinutes([t("09:00"), t("09:10")]), 10);
});

test("temps passé par jour d'activité : médiane et part des jours dans les cinq minutes promises", () => {
  const s = timeSpent([
    // 4 novembre : vue 09:00, décision 09:03 → 3 min.
    row({ seen_at: at("09:00"), decided_at: at("09:03"), status: "executee" }),
    // 5 novembre : vue 10:00, décision 10:09 → 9 min.
    row({ proposed_on: "2026-11-05", seen_at: at("10:00", "2026-11-05"), decided_at: at("10:09", "2026-11-05"), status: "refusee", refusal_reason: "autre" }),
  ]);
  assert.equal(s.activeDays, 2);
  assert.equal(s.medianMinutes, 6);
  assert.equal(s.withinPromise, 0.5);
  assert.deepEqual(timeSpent([row()]), { activeDays: 0, medianMinutes: null, withinPromise: null }); // jamais vue : aucune activité
});

// ─── Le rapport ───────────────────────────────────────────────────────────────

test("le rapport montre les sept assistants, même muets, et alerte seulement ceux qui le méritent", () => {
  const refus = many(10, { assistant: "hugo", status: "refusee", decided_at: at("09:00"), refusal_reason: "trop_cher" });
  const rapport = buildReport([...refus, row({ assistant: "lea", type: "tickets_a_verifier" })], { todayISO: DAY });

  assert.equal(rapport.byAssistant.length, Object.keys(ASSISTANTS).length);
  assert.equal(rapport.byAssistant.find((a) => a.assistant === "max")?.measure.produced, 0); // un assistant muet se voit
  assert.deepEqual(rapport.alerts, [{ assistant: "hugo", name: "Hugo", yesRate: 0, decided: 10 }]);
  assert.equal(rapport.network.shown, 11);
  assert.equal(rapport.days, 30);
});

test("par établissement : classés par idées montrées, puis par identifiant", () => {
  const rapport = buildReport([row({ restaurant_id: "b" }), row({ restaurant_id: "a" }), ...many(2, { restaurant_id: "c" })], { todayISO: DAY });
  assert.deepEqual(rapport.byRestaurant.map((r) => r.restaurantId), ["c", "a", "b"]);
});

// ─── L'effet d'une relance ────────────────────────────────────────────────────

const SENT = Date.parse("2026-10-01T09:00:00Z");
const days = (n: number) => SENT + n * 86_400_000;
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

test("revenus contre témoins : l'écart se lit en points, avec les effectifs", () => {
  const treated = ids("t", 40);
  const holdout = ids("h", 40);
  const orders = new Map<string, number[]>();
  treated.slice(0, 10).forEach((id) => orders.set(id, [days(3)])); // 10 / 40 = 25 %
  holdout.slice(0, 4).forEach((id) => orders.set(id, [days(5)])); //   4 / 40 = 10 %

  const e = campaignEffect({ treatedIds: treated, holdoutIds: holdout, orderTimes: orders, sentAtMs: SENT, nowMs: days(30) });
  assert.equal(e.treatedReturned, 10);
  assert.equal(e.holdoutReturned, 4);
  assert.equal(e.treatedRate, 0.25);
  assert.equal(e.holdoutRate, 0.1);
  assert.equal(e.liftPoints, 15);
  assert.equal(e.complete, true);
  assert.equal(e.enoughHoldout, true);
});

test("un ticket avant l'envoi ou après la fenêtre de 14 jours n'est pas un retour", () => {
  assert.equal(RETURN_WINDOW_DAYS, 14);
  const orders = new Map<string, number[]>([
    ["avant", [days(-1)]],
    ["pile-a-l-envoi", [SENT]],
    ["apres", [days(15)]],
    ["dans-la-fenetre", [days(14)]], // le 14e jour compte
  ]);
  const e = campaignEffect({ treatedIds: ["avant", "pile-a-l-envoi", "apres", "dans-la-fenetre"], holdoutIds: [], orderTimes: orders, sentAtMs: SENT, nowMs: days(30) });
  assert.equal(e.treatedReturned, 1);
});

test("une relance récente est « en cours », pas jugée ; un petit groupe témoin est dit trop petit", () => {
  assert.equal(MIN_HOLDOUT_FOR_EFFECT, 30);
  const e = campaignEffect({ treatedIds: ids("t", 20), holdoutIds: ids("h", 5), orderTimes: new Map(), sentAtMs: SENT, nowMs: days(5) });
  assert.equal(e.complete, false);
  assert.equal(e.enoughHoldout, false);
});

test("sans traités ou sans témoins : pas d'écart inventé", () => {
  const sansTemoins = campaignEffect({ treatedIds: ids("t", 10), holdoutIds: [], orderTimes: new Map(), sentAtMs: SENT, nowMs: days(30) });
  assert.equal(sansTemoins.holdoutRate, null);
  assert.equal(sansTemoins.liftPoints, null);
  const vide = campaignEffect({ treatedIds: [], holdoutIds: [], orderTimes: new Map(), sentAtMs: SENT, nowMs: days(30) });
  assert.equal(vide.treatedRate, null);
  assert.equal(vide.liftPoints, null);
});
