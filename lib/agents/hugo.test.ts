import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_COOLDOWN_DAYS,
  LAPSED_DAYS,
  LAPSED_MAX_DAYS,
  MAX_MESSAGE_LENGTH,
  MIN_AUDIENCE,
  HUGO_WINBACK_KEY,
  lapsedDraft,
  lapsedIdea,
  messageProblem,
  promoAnnouncementIdea,
  selectLapsed,
  type HugoLapsedInput,
  type HugoMember,
} from "./hugo";
import { isHoldout } from "../sequence-rules";
import type { HugoRelay } from "./chloe";

const DAY = 86_400_000;
const TODAY = "2026-11-05";
const NOW = Date.parse("2026-11-05T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function member(id: string, daysAgo: number, over: Partial<HugoMember> = {}): HugoMember {
  return { userId: id, lastOrderAt: ago(daysAgo), orders: 3, promoConsent: true, lastContactAt: null, ...over };
}

/** `n` anciens clients consentants, absents depuis 30 jours. */
function cohort(n: number, daysAgo = 30): HugoMember[] {
  return Array.from({ length: n }, (_, i) => member(`m${String(i).padStart(3, "0")}`, daysAgo));
}

function input(members: HugoMember[], over: Partial<HugoLapsedInput> = {}): HugoLapsedInput {
  return { restaurantId: "demo-x", restaurantName: "Chez Demo", todayISO: TODAY, nowMs: NOW, pct: 0.04, members, ...over };
}

// ─── Les clients à relancer ───────────────────────────────────────────────────

test("une cohorte assez grande : une idée avec un message sans euro, sans cadeau, validée avant tout envoi", () => {
  const idea = lapsedIdea(input(cohort(40)));
  assert.ok(idea);
  assert.equal(idea.assistant, "hugo");
  assert.equal(idea.type, "clients_a_relancer");
  assert.equal(idea.title, `40 clients ne sont pas revenus depuis ${LAPSED_DAYS} jours`);
  assert.equal(idea.question, "Je leur écris ?");
  assert.equal(idea.estimate, null); // aucune promesse de retour de clients (ADR 0068)
  assert.equal(idea.decideBy, "2026-11-12");
  assert.equal(idea.action.kind, "send_to_members");
  if (idea.action.kind !== "send_to_members") return;
  assert.equal(idea.action.campaign, HUGO_WINBACK_KEY);
  assert.equal(idea.action.message, lapsedDraft("Chez Demo"));
  assert.equal(messageProblem(idea.action.message), null);
  assert.match(idea.lines.cost, /0 € de cadeau en plus/);
  assert.match(idea.lines.cost, /taux de 4 %/);
});

test("la phrase dit combien reçoivent le message et combien sont laissés de côté", () => {
  const sel = selectLapsed(input(cohort(40)));
  const idea = lapsedIdea(input(cohort(40)));
  assert.ok(idea);
  assert.ok(idea.lines.what.startsWith(`Un message à ${sel.treated.length} clients`));
  assert.ok(idea.lines.who.includes(`${sel.holdout.length}`));
  assert.match(idea.lines.who, /sans message, pour mesurer/);
});

test("cohorte trop petite pour avoir un témoin lisible : Hugo ne dit rien", () => {
  assert.equal(MIN_AUDIENCE, 10);
  assert.equal(lapsedIdea(input(cohort(MIN_AUDIENCE - 1))), null);
  assert.ok(lapsedIdea(input(cohort(MIN_AUDIENCE))));
  assert.equal(lapsedIdea(input([])), null);
});

test("la fenêtre : 21 jours inclus, 90 jours inclus, 20 et 91 exclus", () => {
  assert.equal(LAPSED_DAYS, 21);
  assert.equal(LAPSED_MAX_DAYS, 90);
  const at = (d: number) => selectLapsed(input([member("a", d)])).lapsed;
  assert.equal(at(20), 0);
  assert.equal(at(21), 1);
  assert.equal(at(90), 1);
  assert.equal(at(91), 0);
});

test("sans consentement aux offres : compté, jamais visé", () => {
  const members = [...cohort(12), member("sans", 30, { promoConsent: false })];
  const sel = selectLapsed(input(members));
  assert.equal(sel.lapsed, 13);
  assert.equal(sel.noConsent, 1);
  assert.equal(sel.reachable.length, 12);
  assert.ok(!sel.reachable.includes("sans"));
});

test("déjà relancé ces 30 derniers jours (réactivation automatique ou Hugo) : écarté ; plus ancien : de nouveau joignable", () => {
  assert.equal(CONTACT_COOLDOWN_DAYS, 30);
  const members = [
    ...cohort(12),
    member("relance-recente", 30, { lastContactAt: ago(10) }),
    member("relance-ancienne", 30, { lastContactAt: ago(40) }),
  ];
  const sel = selectLapsed(input(members));
  assert.equal(sel.recentlyContacted, 1);
  assert.ok(!sel.reachable.includes("relance-recente"));
  assert.ok(sel.reachable.includes("relance-ancienne"));
});

test("jamais un membre sans ticket validé, ni une date illisible", () => {
  const sel = selectLapsed(input([member("zero", 30, { orders: 0 }), member("date", 30, { lastOrderAt: "pas une date" })]));
  assert.equal(sel.lapsed, 0);
});

test("le tirage des témoins est celui des séquences : stable, disjoint des traités, et il couvre tout le monde", () => {
  const sel = selectLapsed(input(cohort(200)));
  assert.deepEqual(selectLapsed(input(cohort(200))).holdout, sel.holdout); // stable d'un appel à l'autre
  assert.deepEqual(
    sel.holdout,
    sel.reachable.filter((id) => isHoldout(id, HUGO_WINBACK_KEY))
  );
  assert.equal(sel.holdout.length + sel.treated.length, sel.reachable.length);
  assert.ok(sel.holdout.every((id) => !sel.treated.includes(id)));
  // Sur 200 membres, 10 % de témoins : l'ordre de grandeur doit tenir (le hachage n'est pas dégénéré).
  assert.ok(sel.holdout.length >= 8 && sel.holdout.length <= 35, `témoins : ${sel.holdout.length}`);
});

test("la trace garde de quoi réviser les seuils", () => {
  const idea = lapsedIdea(input([...cohort(12), member("sans", 30, { promoConsent: false }), member("trop-ancien", 120)]));
  assert.ok(idea);
  assert.equal(idea.evidence.lapsed, 13);
  assert.equal(idea.evidence.reachable, 12);
  assert.equal(idea.evidence.noConsent, 1);
  assert.equal(idea.evidence.recentlyContacted, 0);
  assert.equal(idea.evidence.minDays, 21);
  assert.equal(idea.evidence.maxDays, 90);
  assert.equal(idea.evidence.holdoutPct, 10);
  assert.equal(Number(idea.evidence.treated) + Number(idea.evidence.holdout), 12);
});

// ─── Le message ───────────────────────────────────────────────────────────────

test("le brouillon porte le nom de l'établissement, sans euro ni promesse de cadeau", () => {
  const draft = lapsedDraft("Belchicken Demo");
  assert.match(draft, /Belchicken Demo/);
  assert.doesNotMatch(draft, /€|euro/i);
  assert.doesNotMatch(draft, /cadeau offert|gratuit/i);
  assert.equal(messageProblem(draft), null);
});

test("un message modifié par le gérant est revérifié : vide, trop long, ou un montant en euros", () => {
  assert.match(messageProblem("   ") ?? "", /vide/);
  assert.match(messageProblem("x".repeat(MAX_MESSAGE_LENGTH + 1)) ?? "", /caractères/);
  assert.equal(messageProblem("x".repeat(MAX_MESSAGE_LENGTH)), null);
  assert.match(messageProblem("−2 € sur ton menu") ?? "", /euros/);
  assert.match(messageProblem("Un menu à 5 euros") ?? "", /euros/);
  assert.match(messageProblem("5 EUROS offerts") ?? "", /euros/);
  assert.equal(messageProblem("−30 % sur le burger 🎉"), null);
});

test("un nom d'établissement qui ferait échouer le brouillon : pas d'idée plutôt qu'un message refusé plus tard", () => {
  assert.equal(lapsedIdea(input(cohort(40), { restaurantName: "Chez 5 € Demo" })), null);
});

// ─── Le relais de Chloé ───────────────────────────────────────────────────────

const promoRelay: HugoRelay = {
  to: "hugo",
  nature: "promo",
  message: "😍 Spécial jeudi : −30% sur Burger pour les membres ! Montre ton app en caisse 🎉",
  productId: "p-burger",
  discountPct: 30,
  sendOn: "2026-11-11",
  promoOn: "2026-11-12",
};

test("une promo de Chloé devient une annonce programmée la veille, rien de neuf dans le message", () => {
  const idea = promoAnnouncementIdea(promoRelay, TODAY);
  assert.ok(idea);
  assert.equal(idea.assistant, "hugo");
  assert.equal(idea.type, "promo_a_annoncer");
  assert.equal(idea.title, "Annoncer la promo du 2026-11-12 à tes membres");
  assert.equal(idea.decideBy, "2026-11-11");
  assert.deepEqual(idea.action, {
    kind: "schedule_broadcast",
    message: promoRelay.message,
    sendOn: "2026-11-11",
    promoOn: "2026-11-12",
    label: "Programmer",
  });
  assert.match(idea.lines.what, /^Annonce le 2026-11-11, la veille de la promo/);
  assert.match(idea.lines.who, /accepté les offres/);
});

test("un plat mis en avant, sans remise : l'annonce part aujourd'hui, aucun prix ne bouge", () => {
  const idea = promoAnnouncementIdea({ ...promoRelay, discountPct: null, sendOn: null, promoOn: null, message: "😋 À essayer cette semaine : Tenders !" }, TODAY);
  assert.ok(idea);
  assert.equal(idea.title, "Annoncer ce plat à tes membres");
  assert.match(idea.lines.what, /^Annonce aujourd'hui :/);
  assert.match(idea.lines.cost, /aucun prix ne bouge/);
  assert.equal(idea.decideBy, TODAY);
  assert.equal(idea.action.kind, "schedule_broadcast");
});

test("une annonce dont le jour est passé, ou dont le message porte un euro, n'est jamais proposée", () => {
  assert.equal(promoAnnouncementIdea({ ...promoRelay, sendOn: "2026-11-04" }, TODAY), null);
  assert.equal(promoAnnouncementIdea({ ...promoRelay, message: "−2 € sur le menu" }, TODAY), null);
});
