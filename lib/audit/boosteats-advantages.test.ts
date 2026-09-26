import { test } from "node:test";
import assert from "node:assert/strict";
import { boosteatsAdvantages } from "./boosteats-advantages";
import { emptySignals } from "./measure";

test("toujours 5 avantages, la fidélité en tête, sans doublon", () => {
  for (const sig of [null, emptySignals()]) {
    const out = boosteatsAdvantages(sig);
    assert.equal(out.length, 5);
    assert.equal(out[0].key, "fidelite");
    assert.equal(new Set(out.map((a) => a.key)).size, 5);
  }
});

test("les avantages suivent l'audit", () => {
  // Peu d'avis, note qui baisse, plaintes : avis et retour privé montent.
  const rep = boosteatsAdvantages({ ...emptySignals(), reviewVolume: "faible", trend: "baisse", rating: "moyenne", negativeThemes: ["attente", "accueil"] });
  assert.deepEqual(rep.slice(0, 3).map((a) => a.key), ["fidelite", "avis", "prive"]);
  // Ventes surtout par les plateformes : « moins de commissions » entre.
  const plat = boosteatsAdvantages({ ...emptySignals(), channelMix: "plateformes_dominantes" });
  assert.ok(plat.slice(0, 3).some((a) => a.key === "direct"));
  // Sans ce signal, il reste hors des 5.
  assert.equal(boosteatsAdvantages(emptySignals()).some((a) => a.key === "direct"), false);
});

test("l'avantage avis reprend la formule choisie", () => {
  const avis = boosteatsAdvantages({ ...emptySignals(), reviewVolume: "faible" }).find((a) => a.key === "avis")!;
  assert.match(avis.text, /^Encourager vos clients à laisser un avis avec Boosteats/);
});
