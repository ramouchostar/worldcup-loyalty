import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROVIDER_RULES, RESTAURANT_RULES, RULES, RULES_ACCEPT_LABEL, RULES_REFUSAL_TEXT, RULES_VERSION, readAcceptance, rulesFingerprint } from "./mission-rules";
import { FREE_CANCEL_HOURS, LATE_CANCEL_HOURS } from "./mission-cancellation";
import { MIN_DEPOSIT_BPS } from "./mission-money";
import { AUTO_VALIDATE_DAYS, MAX_RETOUCH_ROUNDS } from "./mission-states";
import { SHOOT_MIN_DAYS } from "./mission-brief";
import { proposalDeadlines } from "./mission-proposals";

const all = (rules: readonly { title: string; text: string }[]) => rules.map((r) => `${r.title} ${r.text}`).join("\n");

test("le texte des règles a une empreinte épinglée : on ne change pas une règle sans changer la version", () => {
  // Si ce test échoue : tu as modifié le texte. Change RULES_VERSION (la date du jour), puis mets l'empreinte à jour ici.
  assert.equal(RULES_VERSION, "2026-10-14");
  assert.equal(rulesFingerprint(), "1ac4fb6c");
});

test("chaque règle a un titre et un texte, sans doublon, sans montant en euros ni commission", () => {
  for (const audience of ["restaurant", "provider"] as const) {
    const rules = RULES[audience];
    assert.ok(rules.length >= 8, audience);
    assert.equal(new Set(rules.map((r) => r.title)).size, rules.length, audience);
    for (const r of rules) {
      assert.ok(r.title.length > 5 && r.title.length < 70, r.title);
      assert.ok(r.text.length > 40 && r.text.length < 500, r.title);
    }
    assert.doesNotMatch(all(rules), /€|euro/i, audience);
    assert.doesNotMatch(all(rules), /12,5|87,5|92,5|7,5 ?%/, audience); // la commission n'est jamais écrite dans les règles (elle est sur le devis)
  }
});

test("les chiffres écrits dans les règles sont ceux du code", () => {
  const r = all(RESTAURANT_RULES);
  // Barème d'annulation
  assert.equal(FREE_CANCEL_HOURS, 7 * 24);
  assert.equal(LATE_CANCEL_HOURS, 48);
  assert.match(r, /plus de 7 jours avant le tournage est gratuit/);
  assert.match(r, /Entre 7 jours et 48 heures avant, la moitié/);
  assert.match(r, /moins de 48 heures, ou si tu n'es pas là, tout est dû/);
  // Acompte
  assert.equal(MIN_DEPOSIT_BPS, 2000);
  assert.match(r, /acompte d'au moins 20 %/);
  // Retouches
  assert.equal(MAX_RETOUCH_ROUNDS, 2);
  assert.match(r, /Deux tours de retours/);
  assert.match(all(PROVIDER_RULES), /Deux tours de retours/);
  // Validation automatique
  assert.equal(AUTO_VALIDATE_DAYS, 7);
  assert.match(r, /au bout de 7 jours, elle est validée automatiquement/);
  assert.match(all(PROVIDER_RULES), /Le restaurateur a 7 jours pour répondre/);
  // Date et équipe
  assert.equal(SHOOT_MIN_DAYS, 7);
  assert.match(r, /au moins 7 jours à l'avance/);
  assert.match(r, /au plus tard 7 jours avant le tournage/);
  // Idées : J-4 pour le prestataire, J-2 pour la retenue d'office
  const d = proposalDeadlines("2026-11-10");
  assert.equal(d.providerDue, "2026-11-06"); // J-4
  assert.equal(d.autoFirst, "2026-11-08"); // J-2
  assert.match(all(PROVIDER_RULES), /au plus tard 4 jours avant/);
  assert.match(r, /deux jours avant le tournage/);
  assert.match(all(PROVIDER_RULES), /Tu confirmes ta présence 2 jours avant/);
});

test("le restaurateur et le prestataire lisent deux textes différents, avec leurs règles en commun", () => {
  assert.notEqual(all(RESTAURANT_RULES), all(PROVIDER_RULES));
  assert.ok(RESTAURANT_RULES.some((r) => r.title === "En cas de désaccord, Boosteats tranche"));
  assert.ok(PROVIDER_RULES.some((r) => r.title === "En cas de désaccord, Boosteats tranche"));
  assert.ok(RESTAURANT_RULES.some((r) => /décideurs/.test(r.title)));
  assert.ok(PROVIDER_RULES.some((r) => /devis est ferme/.test(r.title)));
  assert.notEqual(RULES_ACCEPT_LABEL.restaurant, RULES_ACCEPT_LABEL.provider);
});

test("l'acceptation exige « oui » ET la version montrée", () => {
  assert.deepEqual(readAcceptance({ accepted: true, version: RULES_VERSION }), { ok: true, acceptance: { accepted: true, version: RULES_VERSION } });
  assert.deepEqual(readAcceptance({ accepted: true, version: "2020-01-01" }), { ok: false, reason: "outdated" });
  assert.deepEqual(readAcceptance({ accepted: true }), { ok: false, reason: "outdated" });
  assert.deepEqual(readAcceptance({ accepted: false, version: RULES_VERSION }), { ok: false, reason: "not_accepted" });
  assert.deepEqual(readAcceptance({ accepted: "true", version: RULES_VERSION }), { ok: false, reason: "not_accepted" });
  assert.deepEqual(readAcceptance({ version: RULES_VERSION }), { ok: false, reason: "not_accepted" });
  assert.deepEqual(readAcceptance(null), { ok: false, reason: "not_accepted" });
  assert.deepEqual(readAcceptance(undefined), { ok: false, reason: "not_accepted" });
  assert.deepEqual(readAcceptance("oui"), { ok: false, reason: "not_accepted" });
  for (const t of Object.values(RULES_REFUSAL_TEXT)) assert.ok(t.length > 15);
});

test("la migration : une acceptation par mission et version (restaurateur), par prestataire et version (prestataire)", () => {
  const sql = readFileSync("docs/migrations/20261014-1000-prestataires-regles.sql", "utf8");
  assert.match(sql, /rules_acceptances_restaurant_uniq ON rules_acceptances \(mission_id, version\) WHERE audience = 'restaurant'/);
  assert.match(sql, /rules_acceptances_provider_uniq ON rules_acceptances \(provider_id, version\) WHERE audience = 'provider'/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /CREATE POLICY/);
});
