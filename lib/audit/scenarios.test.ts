import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS } from "./scenarios";
import { recommend, matchingScenarios } from "./recommend";
import { FICHE_GAPS, NEGATIVE_THEMES, type AuditSignals } from "./signals";

// Générateur déterministe (mulberry32) : les mêmes cas à chaque exécution.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const subset = <T,>(r: () => number, xs: readonly T[], p: number): T[] => xs.filter(() => r() < p);

function randomSignals(r: () => number): AuditSignals {
  const gaps = subset(r, FICHE_GAPS, 0.3);
  return {
    rating: pick(r, ["fragile", "moyenne", "bonne", "excellente"] as const),
    trend: pick(r, ["baisse", "stable", "hausse"] as const),
    reviewVolume: pick(r, ["faible", "moyen", "fort"] as const),
    responseRate: pick(r, ["faible", "moyen", "fort"] as const),
    negativeThemes: subset(r, NEGATIVE_THEMES, 0.3).sort(() => r() - 0.5),
    ficheGaps: gaps,
    gapsCoveredByCompetitors: subset(r, gaps, 0.5),
    instagram: pick(r, ["absent", "dormant", "irregulier", "actif_peu_engage", "performant"] as const),
    tiktok: pick(r, ["absent", "dormant", "irregulier", "actif_peu_engage", "performant"] as const),
    channelMix: pick(r, ["plateformes_dominantes", "equilibre", "direct_dominant"] as const),
    price: pick(r, ["eco", "moyen", "premium"] as const),
    position: pick(r, ["derriere", "au_niveau", "devant"] as const),
  };
}

const NOTHING_KNOWN: AuditSignals = {
  rating: null, trend: null, reviewVolume: null, responseRate: null, negativeThemes: [], ficheGaps: [],
  gapsCoveredByCompetitors: [], instagram: null, tiktok: null, channelMix: null, price: null, position: null,
};

test("plus de 250 scénarios, chacun avec un identifiant unique", () => {
  assert.ok(SCENARIOS.length >= 250, `seulement ${SCENARIOS.length}`);
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
});

test("chaque scénario dit un constat, au moins un geste et un chiffre à suivre", () => {
  for (const s of SCENARIOS) {
    assert.ok(s.title && s.diagnostic && s.kpi, s.id);
    assert.ok(s.steps.length > 0 && s.steps.every((x) => x.trim().length > 10), s.id);
  }
});

test("aucun signal lu → aucune recommandation (on ne conseille pas sur du « non vérifié »)", () => {
  assert.equal(matchingScenarios(NOTHING_KNOWN).length, 0);
});

test("chaque scénario est atteignable par au moins un audit", () => {
  const r = rng(68);
  const reached = new Set<string>();
  for (let i = 0; i < 30000; i++) for (const s of matchingScenarios(randomSignals(r))) reached.add(s.id);
  const never = SCENARIOS.filter((s) => !reached.has(s.id)).map((s) => s.id);
  assert.deepEqual(never, []);
});

test("un audit complet donne toujours cinq priorités sur des sujets distincts", () => {
  const r = rng(2026);
  for (let i = 0; i < 5000; i++) {
    const { top } = recommend(randomSignals(r));
    assert.equal(top.length, 5);
    const fams = top.map((s) => s.family).filter((f) => f !== "fiche");
    assert.equal(new Set(fams).size, fams.length);
  }
});

test("le cas de la maquette : attente en hausse et note qui baisse passent devant la description", () => {
  const { top } = recommend({
    ...NOTHING_KNOWN,
    rating: "moyenne",
    trend: "baisse",
    reviewVolume: "faible",
    responseRate: "faible",
    negativeThemes: ["attente", "livraison_froide"],
    ficheGaps: ["pas_de_lien_commande", "pas_de_description", "horaires_exceptionnels"],
    gapsCoveredByCompetitors: ["pas_de_lien_commande"],
    instagram: "dormant",
    tiktok: "absent",
    channelMix: "plateformes_dominantes",
    price: "moyen",
    position: "derriere",
  });
  assert.ok(top.slice(0, 2).some((s) => s.id === "avis_theme.attente.faible.baisse"));
  assert.ok(top.some((s) => s.id === "fiche.pas_de_lien_commande.concurrents_oui"));
  assert.ok(!top.some((s) => s.id.startsWith("fiche.pas_de_description")));
});

test("une solution « après » ne passe jamais devant son préalable", () => {
  const r = rng(7);
  for (let i = 0; i < 5000; i++) {
    const sig = randomSignals(r);
    const { top } = recommend(sig);
    const families = new Set(matchingScenarios(sig).map((s) => s.family));
    top.forEach((s, idx) => {
      if (s.after && families.has(s.after)) assert.ok(top.slice(0, idx).some((p) => p.family === s.after), s.id);
    });
  }
});
