import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignReach, campaignResults, pubHomeCards, type PubCardSource } from "./home-card";

// Les deux jours réels de BE002_houba_META_NOTORIETE_v1 (lus le 2026-11-14).
const HOUBA_DAYS = [
  { spend_cents: 1243, results: 10744, reach: 10744, clicks: 0 },
  { spend_cents: 159, results: 1388, reach: 1388, clicks: 0 },
];

test("portée : le total unique de Meta, jamais la somme des jours quand il est lu", () => {
  assert.deepEqual(campaignReach(HOUBA_DAYS, { reach: 11634 }), { reach: 11634, source: "meta" });
});

test("portée : la somme des jours seulement tant que Meta n'a rien donné", () => {
  assert.deepEqual(campaignReach(HOUBA_DAYS, null), { reach: 12132, source: "jours" });
  assert.deepEqual(campaignReach(HOUBA_DAYS, { reach: 0 }), { reach: 12132, source: "jours" });
  assert.deepEqual(campaignReach(HOUBA_DAYS, { reach: "11634" }), { reach: 12132, source: "jours" });
  assert.deepEqual(campaignReach([], null), { reach: 0, source: "jours" });
});

test("résultat : la notoriété prend la portée unique, les clics s'additionnent", () => {
  assert.equal(campaignResults("NOTORIETE", HOUBA_DAYS, 11634), 11634);
  const clicks = [{ spend_cents: 500, results: 12, reach: 900, clicks: 12 }, { spend_cents: 500, results: 8, reach: 800, clicks: 8 }];
  assert.equal(campaignResults("TRAFIC", clicks, 1500), 20);
});

const base: PubCardSource = {
  id: "r1",
  status: "en_diffusion",
  objective: "NOTORIETE",
  objectiveLabel: "Se faire connaître dans le quartier",
  resultLabel: "personnes touchées",
  radiusKm: 3,
  endsOn: "2026-11-27",
  creative: { thumbnail: "https://exemple.invalid/vignette.jpg" },
  results: 11634,
  paidCents: 200_00,
  spentCents: 14_02,
  offerKeyword: "FAMILY",
  offerTo: "2026-11-27",
};
const opts = { restaurantId: "houba", today: "2026-11-14" };

test("encart : la pub de Houba telle que la maquette la montre", () => {
  const [c] = pubHomeCards([base], opts);
  assert.equal(c.statusLabel, "En diffusion");
  assert.equal(c.statusTone, "good");
  assert.equal(c.where, "3 km autour · jusqu'au 27 nov.");
  assert.equal(c.resultLine, "personnes autour du resto ont vu ta pub");
  assert.equal(c.remainingCents, 185_98);
  assert.equal(c.keyword, "FAMILY");
  assert.equal(c.href, "/admin/houba/pub");
});

test("encart : seulement une pub en diffusion ou en pause", () => {
  const statuses = ["paiement_attendu", "payee", "preparee", "a_corriger", "terminee", "annulee"] as const;
  assert.deepEqual(pubHomeCards(statuses.map((status) => ({ ...base, status })), opts), []);
  const [paused] = pubHomeCards([{ ...base, status: "en_pause" }], opts);
  assert.equal(paused.statusLabel, "En pause");
  assert.equal(paused.statusTone, "neutral");
});

test("encart : le mot clé disparaît quand l'offre est finie, le reste ne descend pas sous zéro", () => {
  const [c] = pubHomeCards([{ ...base, offerTo: "2026-11-13", spentCents: 210_00 }], opts);
  assert.equal(c.keyword, null);
  assert.equal(c.remainingCents, 0);
  const [blank] = pubHomeCards([{ ...base, offerKeyword: "  " }], opts);
  assert.equal(blank.keyword, null);
});

test("encart : un objectif sans phrase dédiée garde le libellé de la page Pub", () => {
  const [c] = pubHomeCards([{ ...base, objective: "MESSAGES", resultLabel: "conversations", radiusKm: null }], opts);
  assert.equal(c.resultLine, "conversations");
  assert.equal(c.where, "jusqu'au 27 nov.");
});
