import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMMA_CAMPAIGN_DAYS,
  EMMA_DAILY_EUROS,
  EMMA_LEAD_DAYS,
  EMMA_RADIUS_KM,
  emmaDecision,
  offerKeyword,
  type EmmaInput,
} from "./emma";
import { judgeRequest, type Creative } from "../ads/meta-spec";
import { dailyAdvice, type Estimate } from "../ads/estimate";

// Le jeudi 5 novembre 2026 : départ le dimanche 8 (J+3), fin le samedi 21 (14 jours).
const TODAY = "2026-11-05";
const THURSDAY = 3; // 0 = lundi

const creative: Creative = { kind: "instagram_post", mediaId: "17900000000000001", mediaType: "IMAGE", permalink: null, thumbnail: null };
const clicksEstimate: Estimate = { kind: "clicks", lo: 200, hi: 480, frequency: null, audience: 50_000, calibrated: false };

function input(over: Partial<EmmaInput> = {}): EmmaInput {
  return {
    restaurantId: "demo-x",
    todayISO: TODAY,
    pubOpen: true,
    requestInFlight: false,
    offer: { productName: "Burger", discountPct: 30, weekday: THURSDAY },
    creative,
    feePct: 15,
    negotiatedFee: false,
    vatRate: 0,
    estimate: clicksEstimate,
    ...over,
  };
}

function idea(over: Partial<EmmaInput> = {}) {
  const d = emmaDecision(input(over));
  assert.ok(d.idea, `pas d'idée : ${d.reason}`);
  return d.idea;
}

test("la promo du jour creux devient une pub de deux semaines, 3 km, dans le repère de 10 à 15 € par jour", () => {
  const i = idea();
  assert.equal(i.assistant, "emma");
  assert.equal(i.type, "pub_pour_la_promo");
  assert.equal(i.title, "Fais connaître ta promo du jeudi autour de toi");
  assert.equal(i.question, "Je prépare la pub ?");
  assert.equal(i.proposal.objective, "TRAFIC");
  assert.equal(i.proposal.startsOn, "2026-11-08"); // aujourd'hui + 3 jours : le temps du virement et de la vérification
  assert.equal(i.proposal.endsOn, "2026-11-21");
  assert.equal(EMMA_CAMPAIGN_DAYS, 14);
  assert.equal(EMMA_LEAD_DAYS, 3);
  assert.equal(i.proposal.radiusKm, EMMA_RADIUS_KM);
  assert.equal(i.proposal.budgetEuros, EMMA_DAILY_EUROS * 14); // 168 €
  assert.equal(dailyAdvice(Math.floor((i.proposal.budgetEuros * 100) / 14)), "ok");
  assert.equal(i.decideBy, TODAY);
  assert.equal(i.action.kind, "create_ad_request");
});

test("l'offre : la remise, le mot clé du comptoir, valable à partir du premier jeudi de la pub", () => {
  const { offer, adText } = idea().proposal;
  assert.equal(offer.text, "−30 % sur Burger le jeudi");
  assert.equal(offer.keyword, "BURGER");
  assert.equal(offer.from, "2026-11-12"); // le premier jeudi depuis le 8
  assert.equal(offer.to, "2026-11-21");
  assert.match(adText, /Chaque jeudi/);
  assert.doesNotMatch(adText + offer.text, /€|euro/i); // la remise est en pourcentage
});

test("si la pub démarre un jeudi, la promo vaut dès ce jour-là", () => {
  // Lundi 2 novembre + 3 = jeudi 5 novembre.
  const { offer, startsOn } = idea({ todayISO: "2026-11-02" }).proposal;
  assert.equal(startsOn, "2026-11-05");
  assert.equal(offer.from, "2026-11-05");
});

test("le jour de la semaine suit Chloé : un lundi creux donne une offre valable un lundi", () => {
  const { offer } = idea({ offer: { productName: "Tenders", discountPct: 25, weekday: 0 } }).proposal;
  assert.equal(offer.text, "−25 % sur Tenders le lundi");
  assert.equal(offer.from, "2026-11-09");
});

test("la proposition passe le VRAI formulaire de la Pub (dates, budget, rayon, texte, offre, création)", () => {
  const p = idea().proposal;
  const judged = judgeRequest(
    { ...p, creative, billing: { legalName: "Demo SRL", vatNumber: null, address: "1 rue de la Demo, 1000 Bruxelles" }, termsAccepted: true },
    TODAY
  );
  assert.ok(judged.ok, judged.ok ? "" : `refusée : ${judged.issue}`);
});

test("le coût dit le total à virer, le budget, le rythme par jour et les frais", () => {
  const { cost } = idea().lines;
  assert.match(cost, /^193,20 € à virer : 168,00 € de pub \(12,00 € par jour, dans le repère de 10 à 15 €\) \+ 15 % de frais de service\.$/);
  assert.match(idea({ feePct: 10, negotiatedFee: true }).lines.cost, /\+ 10 % de frais de service \(tarif négocié\)\./);
});

test("l'estimation est une fourchette de clics, jamais une promesse ; sans estimation elle est absente", () => {
  const e = idea().estimate;
  assert.ok(e);
  assert.equal(e.low, 200);
  assert.equal(e.high, 480);
  assert.equal(e.unit, "clics vers ton site");
  assert.match(e.basis, /Une fourchette, pas une promesse\./);
  assert.match(e.basis, /des coûts constatés sur des campagnes réelles/);
  assert.match(idea({ estimate: { ...clicksEstimate, calibrated: true } }).estimate?.basis ?? "", /nos campagnes précédentes/);
  assert.equal(idea({ estimate: null }).estimate, null);
  assert.equal(idea({ estimate: { ...clicksEstimate, kind: "reach" } }).estimate, null);
});

test("Emma dit POURQUOI elle ne propose rien, dans cet ordre", () => {
  assert.equal(emmaDecision(input({ pubOpen: false, requestInFlight: true, offer: null, creative: null })).reason, "pub_fermee");
  assert.equal(emmaDecision(input({ requestInFlight: true, offer: null, creative: null })).reason, "demande_en_cours");
  assert.equal(emmaDecision(input({ offer: null, creative: null })).reason, "pas_de_promo");
  assert.equal(emmaDecision(input({ creative: null })).reason, "pas_de_publication");
  assert.equal(emmaDecision(input()).reason, null);
});

test("un mot clé tiré du plat : sans accent, en majuscules, entre 2 et 24 caractères", () => {
  assert.equal(offerKeyword("Burger"), "BURGER");
  assert.equal(offerKeyword("Tenders 5p"), "TENDERS");
  assert.equal(offerKeyword("Crêpe sucrée"), "CREPE");
  assert.equal(offerKeyword("Supercalifragilistic"), "SUPERCALIFRA");
  assert.equal(offerKeyword("  "), "PROMO");
  assert.equal(offerKeyword("A"), "PROMO");
  assert.equal(offerKeyword("🍔"), "PROMO");
});

test("un nom de plat qui rendrait l'offre trop longue : pas d'idée plutôt qu'une demande refusée", () => {
  const d = emmaDecision(input({ offer: { productName: "x".repeat(200), discountPct: 30, weekday: THURSDAY } }));
  assert.equal(d.idea, null);
  assert.equal(d.reason, "proposition_invalide");
});

test("la trace garde de quoi comparer la proposition à ce qu'elle a donné", () => {
  assert.deepEqual(idea().evidence, {
    product: "Burger",
    discountPct: 30,
    weekday: "jeudi",
    days: 14,
    budgetEuros: 168,
    dailyEuros: 12,
    radiusKm: 3,
    feePct: 15,
    totalEuros: 193,
    leadDays: 3,
    estimated: "oui",
  });
});

test("le gérant paie, jamais Emma : aucune idée ne porte de conditions cochées ni de facturation", () => {
  const i = idea() as unknown as Record<string, unknown>;
  assert.equal("termsAccepted" in i, false);
  assert.equal("billing" in i, false);
  assert.equal("termsAccepted" in (i.proposal as object), false);
});
