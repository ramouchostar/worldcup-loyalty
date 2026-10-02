import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RATES,
  MIN_SAMPLE,
  STRATEGIES,
  defaultPitch,
  discoveryRejection,
  isChain,
  prospectFromPlace,
  isBelgianMobile,
  measuredRates,
  normalizeProspect,
  suggestStrategy,
  toE164,
  weekCounts,
  weekStart,
  weeklyPlan,
  type StatusEvent,
} from "./crm-model";

test("suggestStrategy : enseigne d'abord, puis réputation, puis jeune, sinon pilier", () => {
  assert.equal(suggestStrategy({ locations: 3, rating: 3.9 }), "enseigne");
  assert.equal(suggestStrategy({ locations: 1, delivery: ["ubereats"], signals: ["Dépend d'Uber Eats"] }), "enseigne");
  assert.equal(suggestStrategy({ delivery: ["ubereats"] }), "pilier", "être sur Uber Eats ne suffit pas");
  assert.equal(suggestStrategy({ rating: 4.1, reviewsCount: 900 }), "reputation");
  assert.equal(suggestStrategy({ rating: 4.6, reviewsCount: 900, signals: ["Avis sans réponse du propriétaire"] }), "reputation");
  assert.equal(suggestStrategy({ rating: 4.7, reviewsCount: 120 }), "jeune");
  assert.equal(suggestStrategy({ rating: 4.7, reviewsCount: 900, openedYear: 2025 }, 2026), "jeune");
  assert.equal(suggestStrategy({ rating: 4.7, reviewsCount: 900, openedYear: 2019 }, 2026), "pilier");
  assert.equal(suggestStrategy({}), "pilier", "sans donnée : la stratégie qui ne promet que le Gratuit");
});

test("chaque stratégie a son offre : Gratuit pour pilier/réputation, 2 mois Pro pour jeune/enseigne", () => {
  assert.equal(STRATEGIES.pilier.offer, "gratuit");
  assert.equal(STRATEGIES.reputation.offer, "gratuit");
  assert.equal(STRATEGIES.jeune.offer, "pro_2_mois");
  assert.equal(STRATEGIES.enseigne.offer, "pro_2_mois");
});

test("weeklyPlan : 5 signés avec les taux de départ = 10 audits, 13 RDV, 52 contacts", () => {
  assert.deepEqual(weeklyPlan(DEFAULT_RATES), { signed: 5, audits: 10, rdv: 13, contacts: 52 });
});

test("weekStart : lundi de la semaine, dimanche compris", () => {
  assert.equal(weekStart(new Date("2026-10-04T20:00:00Z")).toISOString(), "2026-09-28T00:00:00.000Z");
  assert.equal(weekStart(new Date("2026-10-05T08:00:00Z")).toISOString(), "2026-10-05T00:00:00.000Z");
});

test("weekCounts : prospects distincts par étape, dans la semaine seulement", () => {
  const ev: StatusEvent[] = [
    { prospect_id: "a", to_status: "contacte", created_at: "2026-09-29T10:00:00Z" },
    { prospect_id: "a", to_status: "contacte", created_at: "2026-09-30T10:00:00Z" },
    { prospect_id: "b", to_status: "signe", created_at: "2026-10-01T10:00:00Z" },
    { prospect_id: "c", to_status: "signe", created_at: "2026-09-27T10:00:00Z" },
  ];
  assert.deepEqual(weekCounts(ev, new Date("2026-09-28T00:00:00Z")), { contacts: 1, rdv: 0, audits: 0, signed: 1 });
});

test("measuredRates : hypothèse gardée sous l'échantillon minimal, taux réel au-delà", () => {
  const few = measuredRates([{ prospect_id: "a", to_status: "contacte", created_at: "x" }]);
  assert.equal(few.measured.contactToRdv, false);
  assert.equal(few.rates.contactToRdv, DEFAULT_RATES.contactToRdv);

  const ev: StatusEvent[] = [];
  for (let i = 0; i < MIN_SAMPLE * 2; i++) ev.push({ prospect_id: `p${i}`, to_status: "contacte", created_at: "x" });
  for (let i = 0; i < MIN_SAMPLE; i++) ev.push({ prospect_id: `p${i}`, to_status: "rdv_audit", created_at: "x" });
  const r = measuredRates(ev);
  assert.equal(r.measured.contactToRdv, true);
  assert.equal(r.rates.contactToRdv, 0.5);
  assert.equal(r.samples.contactToRdv, MIN_SAMPLE * 2);
});

test("measuredRates : un signé direct remonte l'entonnoir (pas de taux > 100 %)", () => {
  const ev: StatusEvent[] = [];
  for (let i = 0; i < MIN_SAMPLE; i++) ev.push({ prospect_id: `p${i}`, to_status: "signe", created_at: "x" });
  const r = measuredRates(ev);
  assert.equal(r.rates.auditToSigned, 1);
  assert.equal(r.rates.contactToRdv, 1);
});

test("toE164 / isBelgianMobile", () => {
  assert.equal(toE164("0470 12 34 56"), "+32470123456");
  assert.equal(toE164("+32 2 512 34 56"), "+3225123456");
  assert.equal(toE164("0032 470/12.34.56"), "+32470123456");
  assert.equal(toE164("n/a"), null);
  assert.equal(isBelgianMobile("+32470123456"), true);
  assert.equal(isBelgianMobile("+3225123456"), false);
});

test("defaultPitch : propose l'audit, prénom du gérant si connu, aucun chiffre promis", () => {
  const p = defaultPitch({ name: "Smash X", strategy: "pilier", ownerName: "Karim B." });
  assert.match(p, /^Bonjour Karim,/);
  assert.match(p, /audit gratuit/);
  assert.doesNotMatch(p, /\d+\s?%|€/);
});

test("normalizeProspect : refuse sans nom et hors Bruxelles, ne devine rien", () => {
  assert.equal(normalizeProspect({}).ok, false);
  assert.equal(normalizeProspect({ name: "X", postal_code: "1300" }).ok, false);
  const r = normalizeProspect({
    name: " Snack Y ",
    postal_code: "1030",
    email: "pas-un-email",
    website: "www.sans-schema.be",
    rating: "4,2",
    locations: 0,
    sources: ["https://kbopub.economie.fgov.be/x", "pas une url"],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.name, "Snack Y");
  assert.equal(r.value.email, null);
  assert.equal(r.value.website, null);
  assert.equal(r.value.rating, 4.2);
  assert.equal(r.value.locations, 1);
  assert.equal(r.value.strategy, "reputation");
  assert.equal(r.value.offer, "gratuit");
  assert.deepEqual(r.value.sources, ["https://kbopub.economie.fgov.be/x"]);
  assert.match(r.value.pitch ?? "", /audit gratuit/);
});

test("discoveryRejection : Bruxelles, hors chaînes, type cible, au moins 50 avis", () => {
  const base = {
    id: "ChIJx", name: "Smash Indé", address: "Rue X 1, 1050 Ixelles", postalCode: "1050", locality: "Ixelles",
    rating: 4.6, reviewsCount: 420, website: null, phone: "02 123 45 67", primaryType: "hamburger_restaurant",
    category: "Hamburgers", types: ["hamburger_restaurant", "restaurant"], mapsUri: null,
  };
  assert.equal(discoveryRejection(base), null);
  assert.equal(discoveryRejection({ ...base, postalCode: "1300" }), "hors_bruxelles");
  assert.equal(discoveryRejection({ ...base, name: "Belchicken Ixelles" }), "chaine");
  assert.equal(discoveryRejection({ ...base, name: "McDonald's Louise" }), "chaine");
  assert.equal(discoveryRejection({ ...base, primaryType: "bar", types: ["bar"] }), "type");
  assert.equal(discoveryRejection({ ...base, reviewsCount: 12 }), "peu_d_avis");
  assert.equal(isChain("Paulette Snack"), false, "« Paul » seul, pas un mot dans un autre");
});

test("prospectFromPlace : stratégie déduite, commune des 19, contacts non devinés", () => {
  const p = prospectFromPlace({
    id: "ChIJy", name: "Pita Z", address: null, postalCode: "1030", locality: "Bruxelles", rating: 4.0, reviewsCount: 800,
    website: null, phone: null, primaryType: "restaurant", category: null, types: [], mapsUri: "https://maps.google.com/?cid=1",
  });
  assert.equal(p.commune, "Schaerbeek");
  assert.equal(p.strategy, "reputation");
  assert.equal(p.email, null);
  assert.deepEqual(p.sources, ["https://maps.google.com/?cid=1"]);
});

test("normalizeProspect : stratégie et offre fournies priment", () => {
  const r = normalizeProspect({ name: "Z", strategy: "jeune", offer: "gratuit" });
  assert.ok(r.ok && r.value.strategy === "jeune" && r.value.offer === "gratuit");
});
