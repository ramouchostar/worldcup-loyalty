import { test } from "node:test";
import assert from "node:assert/strict";
import { engineThemes, excerpt, tally } from "./review-themes";
import type { StoredReview } from "./dataforseo";

const NOW = new Date("2026-09-25T12:00:00Z");
const r = (rating: number, text: string, date = "2026-08-01T12:00:00Z"): StoredReview => ({ rating, text, date, ownerAnswer: null, ownerAnswerDate: null });

const numbered = [
  r(1, "35 minutes pour deux menus un mardi midi, beaucoup trop long."),
  r(2, "Attente interminable au comptoir, personne pour prendre la commande.", "2025-12-01T12:00:00Z"),
  r(5, "Excellent burger, la viande est parfaite."),
  r(2, "Frites froides à la livraison."),
  r(5, "Viande de qualité, pain brioché top."),
];

test("les comptes viennent des numéros d'avis, pas du modèle", () => {
  const out = tally([{ key: "attente", label: "Attente trop longue", engine_theme: "attente", reviews: [1, 2, 2, 99, 3], advice: "Préparer à l'avance." }], numbered, "negatif", NOW);
  // 99 hors liste ignoré, doublon ignoré, l'avis 5★ (n° 3) ne compte pas côté négatif.
  assert.equal(out[0].count, 2);
  assert.equal(out[0].share, 0.67); // 2 sur 3 avis 1–3★
  assert.equal(out[0].recent, 1); // un seul dans les 6 derniers mois
  assert.equal(out[0].engineTheme, "attente");
  assert.equal(out[0].example, "35 minutes pour deux menus un mardi midi, beaucoup trop long.");
});

test("un thème cité une seule fois ne remonte pas ; un thème hors liste n'alimente pas le moteur", () => {
  const out = tally(
    [
      { key: "froid", label: "Frites froides", engine_theme: "livraison_froide", reviews: [4] },
      { key: "bruit", label: "Salle bruyante", engine_theme: "inconnu", reviews: [1, 2] },
    ],
    numbered,
    "negatif",
    NOW,
  );
  assert.deepEqual(out.map((t) => t.key), ["bruit"]);
  assert.equal(out[0].engineTheme, null);
  assert.deepEqual(engineThemes(out), []);
});

test("la citation est un extrait du vrai texte, coupé proprement", () => {
  const long = "La viande est vraiment excellente et bien cuite. " + "Le service est rapide et souriant, on reviendra sans hésiter avec toute la famille ce week-end.";
  const e = excerpt(long, 80);
  assert.ok(long.startsWith(e.replace(/…$/, "")));
  assert.ok(e.length <= 81);
});
