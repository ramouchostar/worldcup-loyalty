import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideByInstant,
  decisionPatch,
  ideaKey,
  isVisibleToday,
  planCovers,
  rankIdeas,
  requiredPlan,
  selectIdeas,
  type SelectionContext,
} from "./proposals";
import type { Idea } from "./types";

// Jeudi 5 novembre 2026, 9 h à Bruxelles (8 h UTC, heure d'hiver).
const NOW = Date.parse("2026-11-05T08:00:00Z");

function idea(over: Partial<Idea> = {}): Idea {
  return {
    assistant: "hugo",
    type: "clients_a_relancer",
    title: "12 clients ne reviennent plus",
    question: "Je leur écris ?",
    lines: { what: "Un message", who: "12 clients", cost: "0 €" },
    estimate: null,
    decideBy: "2026-11-10",
    action: { kind: "send_to_members", campaign: "hugo_winback", message: "Tu nous manques", label: "Envoyer" },
    evidence: {},
    ...over,
  };
}

const ctx = (over: Partial<SelectionContext> = {}): SelectionContext => ({
  plan: "pro",
  shownToday: 0,
  openKeys: new Set(),
  refusedKeys: new Set(),
  nowMs: NOW,
  ...over,
});

test("une date limite seule vaut jusqu'à la fin du jour à Bruxelles", () => {
  assert.equal(decideByInstant("2026-11-05").toISOString(), "2026-11-05T22:59:59.999Z"); // hiver : UTC+1
  assert.equal(decideByInstant("2026-07-01").toISOString(), "2026-07-01T21:59:59.999Z"); // été : UTC+2
  assert.equal(decideByInstant("2026-11-05T15:00:00Z").toISOString(), "2026-11-05T15:00:00.000Z");
  assert.throws(() => decideByInstant("demain"));
});

test("le forfait : Chloé chiffre du jour en Gratuit, plat par plat en Croissance, Max en Pro", () => {
  assert.equal(requiredPlan({ assistant: "chloe", type: "ca_du_jour_a_noter" }), "gratuit");
  assert.equal(requiredPlan({ assistant: "chloe", type: "jour_creux_promo" }), "croissance");
  assert.equal(requiredPlan({ assistant: "max", type: "fiche_a_completer" }), "pro");
  assert.ok(planCovers("pro", "croissance"));
  assert.ok(!planCovers("croissance", "pro"));
});

test("l'anti-doublon distingue l'objet : deux plats, deux idées ; deux manques de fiche, deux idées", () => {
  const a = idea({ assistant: "chloe", type: "jour_creux_promo", evidence: { productId: "p1" } });
  const b = idea({ assistant: "chloe", type: "jour_creux_promo", evidence: { productId: "p2" } });
  assert.notEqual(ideaKey(a), ideaKey(b));
  assert.equal(ideaKey(a), "chloe:jour_creux_promo:p1");
  const fiche = (finding: string) =>
    idea({ assistant: "max", type: "fiche_a_completer", action: { kind: "update_fiche", finding, via: "equipe", needsInput: "", label: "Ajouter" } });
  assert.equal(ideaKey(fiche("horaires")), "max:fiche_a_completer:horaires");
  assert.equal(ideaKey(idea()), "hugo:clients_a_relancer");
});

test("tri : date limite la plus proche, puis celle qui a une estimation, puis l'ordre d'arrivée", () => {
  const late = idea({ type: "a", decideBy: "2026-11-12" });
  const soonNoEst = idea({ type: "b", decideBy: "2026-11-06" });
  const soonEst = idea({ type: "c", decideBy: "2026-11-06", estimate: { low: 1, high: 2, unit: "€", basis: "x" } });
  assert.deepEqual(rankIdeas([late, soonNoEst, soonEst]).map((i) => i.type), ["c", "b", "a"]);
});

test("trois idées par jour : la quatrième est écartée avec sa raison, jamais perdue", () => {
  const four = ["a", "b", "c", "d"].map((type, i) => idea({ type, decideBy: `2026-11-0${6 + i}` }));
  const s = selectIdeas(four, ctx());
  assert.deepEqual(s.show.map((i) => i.type), ["a", "b", "c"]);
  assert.deepEqual(s.discard.map((d) => [d.idea.type, d.reason]), [["d", "plafond_du_jour"]]);
});

test("le plafond tient compte de ce qui a déjà été montré aujourd'hui", () => {
  const s = selectIdeas([idea({ type: "a" }), idea({ type: "b" })], ctx({ shownToday: 2 }));
  assert.equal(s.show.length, 1);
  assert.equal(s.discard[0].reason, "plafond_du_jour");
});

test("forfait, idée déjà ouverte, refus récent, doublon dans le lot : chacun sa raison", () => {
  const s = selectIdeas(
    [
      idea({ assistant: "max", type: "fiche_a_completer" }),
      idea({ type: "ouverte" }),
      idea({ type: "refusee" }),
      idea({ type: "deux_fois" }),
      idea({ type: "deux_fois" }),
    ],
    ctx({ plan: "croissance", openKeys: new Set(["hugo:ouverte"]), refusedKeys: new Set(["hugo:refusee"]) })
  );
  assert.deepEqual(s.show.map((i) => i.type), ["deux_fois"]);
  assert.deepEqual(
    s.discard.map((d) => [d.idea.type, d.reason]),
    [
      ["fiche_a_completer", "forfait"],
      ["ouverte", "deja_proposee"],
      ["refusee", "refusee_recemment"],
      ["deux_fois", "deja_proposee"],
    ]
  );
});

test("un second passage le même jour ne réécrit pas une idée déjà écartée", () => {
  const four = ["a", "b", "c", "d"].map((type) => idea({ type }));
  const s = selectIdeas(four, ctx({ shownToday: 3, discardedTodayKeys: new Set(["hugo:a", "hugo:b"]) }));
  assert.deepEqual(s.discard.map((d) => d.idea.type), ["c", "d"]);
});

test("une idée déjà échue n'est ni montrée ni écartée", () => {
  const s = selectIdeas([idea({ decideBy: "2026-11-04" })], ctx());
  assert.equal(s.show.length + s.discard.length, 0);
});

test("Plus tard : cachée aujourd'hui, de retour demain ; échue : plus à décider", () => {
  const row = { status: "proposee" as const, snoozed_until: "2026-11-06", decide_by: "2026-11-10T22:59:59Z" };
  assert.ok(!isVisibleToday(row, "2026-11-05", NOW));
  assert.ok(isVisibleToday(row, "2026-11-06", NOW));
  assert.ok(!isVisibleToday({ ...row, snoozed_until: null, decide_by: "2026-11-05T07:00:00Z" }, "2026-11-05", NOW));
  assert.ok(!isVisibleToday({ ...row, status: "acceptee" }, "2026-11-06", NOW));
});

test("les décisions : Oui, Non avec raison, Plus tard ; rien sur une idée décidée ou échue", () => {
  const row = { status: "proposee" as const, decide_by: "2026-11-10T22:59:59Z", snooze_count: 0 };
  const c = { userId: "u1", nowMs: NOW };
  assert.equal(decisionPatch(row, { kind: "oui" }, c)?.status, "acceptee");
  const non = decisionPatch(row, { kind: "non", reason: "trop_cher" }, c);
  assert.equal(non?.status, "refusee");
  assert.equal(non?.refusal_reason, "trop_cher");
  const later = decisionPatch(row, { kind: "plus_tard" }, c);
  assert.equal(later?.status, undefined); // reste « proposée »
  assert.equal(later?.snoozed_until, "2026-11-06");
  assert.equal(later?.snooze_count, 1);
  assert.equal(decisionPatch({ ...row, status: "refusee" }, { kind: "oui" }, c), null);
  assert.equal(decisionPatch({ ...row, decide_by: "2026-11-05T07:00:00Z" }, { kind: "oui" }, c), null);
});
