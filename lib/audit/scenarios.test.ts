import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS } from "./scenarios";
import { recommend, matchingScenarios } from "./recommend";
import { reviseWithAnswers } from "./revise";
import { FICHE_GAPS, NEGATIVE_THEMES, SEO_GAPS, withAnswers, type AuditSignals, type OwnerAnswers } from "./signals";

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
    heroMargin: pick(r, ["faible", "moyen", "fort"] as const),
    prepSpeed: pick(r, ["rapide", "moyen", "lent"] as const),
    revenueGap: pick(r, ["petit", "moyen", "grand"] as const),
    price: pick(r, ["eco", "moyen", "premium"] as const),
    position: pick(r, ["derriere", "au_niveau", "devant"] as const),
    seoGaps: subset(r, SEO_GAPS, 0.3),
    platformsOutrankUs: r() < 0.5,
  };
}

const NOTHING_KNOWN: AuditSignals = {
  rating: null, trend: null, reviewVolume: null, responseRate: null, negativeThemes: [], ficheGaps: [],
  gapsCoveredByCompetitors: [], instagram: null, tiktok: null, channelMix: null, heroMargin: null,
  prepSpeed: null, revenueGap: null, price: null, position: null,
};

// La situation de la maquette : ce que l'audit mesure seul, avant les réponses du gérant.
const MAQUETTE: AuditSignals = {
  ...NOTHING_KNOWN,
  rating: "moyenne",
  trend: "baisse",
  reviewVolume: "faible",
  responseRate: "faible",
  negativeThemes: ["attente", "livraison_froide"],
  ficheGaps: ["pas_de_lien_commande", "pas_de_description", "horaires_exceptionnels", "photos_anciennes"],
  gapsCoveredByCompetitors: ["pas_de_lien_commande", "photos_anciennes"],
  instagram: "dormant",
  tiktok: "absent",
  price: "moyen",
  position: "derriere",
};

const REPONSES: OwnerAnswers = {
  channels: { surPlace: 20, emporter: 15, uberEats: 35, deliveroo: 15, takeaway: 10, direct: 5 },
  heroProduct: "Brochettes mixtes",
  heroMarginPct: 62,
  prepMinutes: 18,
  monthlyRevenue: 38000,
  monthlyRevenueTarget: 50000,
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
    const fams = top.map((s) => s.family).filter((f) => f !== "fiche" && f !== "seo");
    assert.equal(new Set(fams).size, fams.length);
  }
});

test("le cas de la maquette : attente en hausse et note qui baisse passent devant la description", () => {
  for (const signals of [MAQUETTE, withAnswers(MAQUETTE, REPONSES)]) {
    const { top } = recommend(signals);
    assert.ok(top.slice(0, 3).some((s) => s.id === "avis_theme.attente.faible.baisse"));
    assert.ok(top.some((s) => s.id === "fiche.pas_de_lien_commande.concurrents_oui"));
    assert.ok(!top.some((s) => s.id.startsWith("fiche.pas_de_description")));
  }
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

test("réponses du gérant : les signaux sont tranchés aux bons seuils", () => {
  const s = withAnswers(MAQUETTE, REPONSES);
  assert.equal(s.channelMix, "plateformes_dominantes"); // 35 + 15 + 10 = 60 %
  assert.equal(s.heroMargin, "moyen");
  assert.equal(s.prepSpeed, "lent");
  assert.equal(s.revenueGap, "grand"); // +31,6 %
  assert.equal(withAnswers(MAQUETTE, { ...REPONSES, channels: null }).channelMix, null);
});

test("sans réponses, aucun scénario de canaux, de produit phare ni d'objectif", () => {
  const fams = new Set(matchingScenarios(MAQUETTE).map((s) => s.family));
  for (const f of ["canaux", "produit_phare", "objectif"] as const) assert.ok(!fams.has(f), f);
});

test("la révision dit ce que les réponses ont changé", () => {
  const rev = reviseWithAnswers(MAQUETTE, REPONSES);
  assert.ok(rev.newlyMatched > 0);
  assert.ok(rev.changes.length > 0);
  // Les réponses ne font jamais disparaître un scénario mesuré du plan complet.
  const before = Object.values(rev.before.plan).flat().map((s) => s.id);
  const after = new Set(Object.values(rev.after.plan).flat().map((s) => s.id));
  assert.deepEqual(before.filter((id) => !after.has(id)), []);
  // Chaque priorité ajoutée est bien dans les priorités finales, au rang annoncé.
  for (const c of rev.changes) if (c.kind === "ajoutee") assert.equal(rev.after.top[c.rank - 1].id, c.scenario.id);
});
