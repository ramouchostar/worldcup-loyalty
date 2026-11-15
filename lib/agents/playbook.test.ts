import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBar, isPausedByResults, MIN_MEMBER_AUDIENCE, MIN_OUTCOMES, PLAYS, playFor, trackRecords } from "./playbook";
import { selectIdeas, EMPTY_PROFILE } from "./proposals";
import { ASSISTANTS, type Idea } from "./types";

const NOW = Date.parse("2026-11-15T08:00:00Z");

function idea(over: Partial<Idea> = {}): Idea {
  return {
    assistant: "hugo",
    type: "clients_a_relancer",
    title: "Des clients ne reviennent plus",
    question: "Je leur écris ?",
    lines: { what: "Un message", who: "Des clients", cost: "0 €" },
    estimate: null,
    decideBy: "2026-11-20",
    action: { kind: "send_to_members", campaign: "hugo_winback", message: "Tu nous manques", label: "Envoyer" },
    evidence: { reachable: 60 },
    ...over,
  };
}

test("chaque fiche de jeu est unique, d'un vrai assistant, et dit sa source et sa mesure", () => {
  const keys = new Set<string>();
  for (const p of PLAYS) {
    const k = `${p.assistant}:${p.type}`;
    assert.ok(!keys.has(k), `fiche en double : ${k}`);
    keys.add(k);
    assert.ok(ASSISTANTS[p.assistant], k);
    assert.ok(p.source.trim().length > 0 && p.measure.trim().length > 0, k);
    if (p.status !== "active") assert.ok(p.why, `${k} : une fiche retirée ou une tâche dit pourquoi`);
  }
});

test("condition 1 : un type sans fiche ne passe pas", () => {
  const r = checkBar(idea({ type: "type_invente" }));
  assert.deepEqual(r.ok ? null : r.condition, "fiche_de_jeu");
});

test("condition 1 : une fiche retirée ne passe pas, une tâche non plus", () => {
  const plat = checkBar(idea({ assistant: "chloe", type: "plat_a_mettre_en_avant" }));
  assert.equal(plat.ok ? null : plat.condition, "fiche_de_jeu");
  for (const [assistant, type] of [["chloe", "ca_du_jour_a_noter"], ["lea", "tickets_a_verifier"], ["lea", "cadeau_a_ajouter"]] as const) {
    const r = checkBar(idea({ assistant, type }));
    assert.equal(r.ok ? null : r.condition, "tache", type);
  }
});

test("condition 2 : un jour creux lu sur les tickets du programme ne passe pas", () => {
  const prog = checkBar(idea({ assistant: "chloe", type: "jour_creux_promo", evidence: { weekday: 3, gainLowEur: 200, costEur: 50 } }));
  assert.equal(prog.ok ? null : prog.condition, "caisse");
  const till = checkBar(idea({ assistant: "chloe", type: "jour_creux_promo", evidence: { source: "caisse", gainLowEur: 200, costEur: 50 } }));
  assert.equal(till.ok, true);
});

test(`condition 3 : une relance à moins de ${MIN_MEMBER_AUDIENCE} clients joignables ne passe pas`, () => {
  // Kraainem au 2026-11-15 : 112 clients partis, 1 joignable.
  const r = checkBar(idea({ evidence: { reachable: 1 } }));
  assert.equal(r.ok ? null : r.condition, "audience");
  assert.match(r.ok ? "" : r.detail, /1 client joignable, il en faut 50/);
  assert.equal(checkBar(idea({ evidence: {} })).ok, false, "sans le chiffre, pas de passage");
  assert.equal(checkBar(idea({ evidence: { reachable: 50 } })).ok, true);
});

test("condition 4 : une idée qui coûte doit rapporter plus que son coût dans le cas bas", () => {
  const base = { assistant: "emma" as const, type: "pub_pour_la_promo" };
  const loss = checkBar(idea({ ...base, evidence: { source: "caisse", gainLowEur: 80, costEur: 140 } }));
  assert.equal(loss.ok ? null : loss.condition, "rentable");
  const unknown = checkBar(idea({ ...base, evidence: { source: "caisse" } }));
  assert.equal(unknown.ok ? null : unknown.condition, "rentable");
  assert.equal(checkBar(idea({ ...base, evidence: { source: "caisse", gainLowEur: 300, costEur: 140 } })).ok, true);
});

test("condition 5 : pause sous 8 réussites sur 10, jamais avant 10 résultats", () => {
  assert.equal(isPausedByResults(undefined), false);
  assert.equal(isPausedByResults({ outcomes: MIN_OUTCOMES - 1, successes: 0 }), false, "à l'essai");
  assert.equal(isPausedByResults({ outcomes: 10, successes: 7 }), true);
  assert.equal(isPausedByResults({ outcomes: 10, successes: 8 }), false);
  const rows = [
    ...Array.from({ length: 7 }, () => ({ assistant: "hugo", type: "clients_a_relancer", outcome: "reussi" })),
    ...Array.from({ length: 3 }, () => ({ assistant: "hugo", type: "clients_a_relancer", outcome: "rate" })),
    { assistant: "hugo", type: "clients_a_relancer", outcome: null },
  ];
  const records = trackRecords(rows);
  assert.deepEqual(records.get("hugo:clients_a_relancer"), { outcomes: 10, successes: 7 });
  const r = checkBar(idea(), records);
  assert.equal(r.ok ? null : r.condition, "mesure");
});

test("les idées actives d'aujourd'hui qui n'ont besoin d'aucun chiffre passent (Max, Louis)", () => {
  assert.equal(checkBar(idea({ assistant: "max", type: "fiche_a_completer", evidence: {} })).ok, true);
  assert.equal(checkBar(idea({ assistant: "louis", type: "reponses_aux_avis", evidence: {} })).ok, true);
  assert.ok(playFor({ assistant: "max", type: "fiche_a_completer" }));
});

test("selectIdeas : sous la barre = écartée avec la condition, et ne prend pas de place", () => {
  const ctx = { plan: "pro" as const, shownToday: 0, openKeys: new Set<string>(), profile: EMPTY_PROFILE, nowMs: NOW, applyBar: true };
  const ca = idea({ assistant: "chloe", type: "ca_du_jour_a_noter", action: { kind: "open", path: "/x", label: "Noter" }, evidence: {} });
  const good = idea();
  const sel = selectIdeas([ca, good], ctx);
  assert.deepEqual(sel.show.map((i) => i.type), ["clients_a_relancer"]);
  assert.equal(sel.discard.length, 1);
  assert.equal(sel.discard[0].reason, "sous_la_barre");
  assert.equal(sel.discard[0].bar?.condition, "tache");
  // Sans la barre (idée de l'équipe), rien n'est jugé ici.
  assert.equal(selectIdeas([ca], { ...ctx, applyBar: false }).show.length, 1);
});
