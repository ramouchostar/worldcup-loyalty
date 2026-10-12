import { test } from "node:test";
import assert from "node:assert/strict";
import { VIDEO_TEMPLATE, type BriefAnswers } from "./mission-brief";
import { mergeAnswers, pickProvider, planSend, sanitizeAnswers, type ProviderCandidate } from "./mission-draft";

const TODAY = "2026-10-09";

const full: BriefAnswers = {
  goal: "Nouveau plat",
  format: "Reels",
  idea: "Présenter le nouveau burger signature, sans fioriture.",
  dishes: ["Burger signature"],
  kitchen: "Non",
  sound: "Non",
  tone: "Gourmand",
  deciders: ["Moi seul"],
  deciders_attested: true,
  budget_cents: 80_000,
};

const prov = (over: Partial<ProviderCandidate> = {}): ProviderCandidate => ({
  id: "p1",
  status: "active",
  metiers: ["video"],
  visibility_reduced: false,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

// ── sanitizeAnswers ──
test("seules les questions du modèle sont enregistrées, chaque réponse ramenée à sa forme", () => {
  const out = sanitizeAnswers(
    {
      goal: "  Promotion ",
      idea: "x".repeat(5_000),
      dishes: ["Burger", "", 42, "Frites"],
      budget_cents: 80_000.7,
      deciders_attested: "oui",
      kitchen: 12,
      injecte: { __proto__: "x" },
      is_admin: true,
      shoot_date: "2026-10-30", // phase tournage : refusé dans le brief
    },
    VIDEO_TEMPLATE,
  );
  assert.equal(out.goal, "Promotion");
  assert.equal((out.idea as string).length, 2_000);
  assert.deepEqual(out.dishes, ["Burger", "Frites"]);
  assert.equal(out.budget_cents, 80_001);
  assert.equal(out.deciders_attested, null); // pas un booléen → effacé, jamais « true » par accident
  assert.equal(out.kitchen, null);
  assert.ok(!("injecte" in out) && !("is_admin" in out) && !("shoot_date" in out));
});

test("une entrée qui n'est pas un objet ne donne rien", () => {
  assert.deepEqual(sanitizeAnswers(null, VIDEO_TEMPLATE), {});
  assert.deepEqual(sanitizeAnswers("brief", VIDEO_TEMPLATE), {});
  assert.deepEqual(sanitizeAnswers([1, 2], VIDEO_TEMPLATE), {});
});

test("un montant négatif ou énorme est ramené, jamais enregistré tel quel", () => {
  assert.equal(sanitizeAnswers({ budget_cents: -5 }, VIDEO_TEMPLATE).budget_cents, null);
  assert.equal(sanitizeAnswers({ budget_cents: 9e12 }, VIDEO_TEMPLATE).budget_cents, 10_000_000);
  assert.equal(sanitizeAnswers({ budget_cents: Infinity }, VIDEO_TEMPLATE).budget_cents, null);
});

test("la phase tournage accepte le contact et rejette le reste du brief", () => {
  const out = sanitizeAnswers({ contact: { name: " Karim ", phone: "0470 12 34 56", x: 1 }, goal: "Promotion" }, VIDEO_TEMPLATE, "tournage");
  assert.deepEqual(out, { contact: { name: "Karim", phone: "0470 12 34 56" } });
});

test("fusion : une réponse vidée efface l'ancienne, une nouvelle remplace", () => {
  const merged = mergeAnswers({ goal: "Promotion", idea: "ancien" }, { idea: null, tone: "Sobre" });
  assert.deepEqual(merged, { goal: "Promotion", tone: "Sobre" });
});

// ── pickProvider ──
test("le prestataire est actif et du bon métier", () => {
  assert.equal(pickProvider([prov()], "video"), "p1");
  assert.equal(pickProvider([prov()], "photo"), null);
  assert.equal(pickProvider([prov({ status: "invited" })], "video"), null);
  assert.equal(pickProvider([prov({ status: "suspended" })], "video"), null);
  assert.equal(pickProvider([prov({ status: "excluded" })], "video"), null);
});

test("visibilité réduite : après les autres ; à égalité, le plus ancien", () => {
  const a = prov({ id: "a", visibility_reduced: true, created_at: "2026-01-01T00:00:00Z" });
  const b = prov({ id: "b", created_at: "2026-06-01T00:00:00Z" });
  const c = prov({ id: "c", created_at: "2026-03-01T00:00:00Z" });
  assert.equal(pickProvider([a, b, c], "video"), "c");
  assert.equal(pickProvider([a], "video"), "a");
});

// ── planSend ──
const base = { status: "brief" as const, metier: "video" as const, answers: full, template: VIDEO_TEMPLATE, today: TODAY, providers: [prov()] };

test("un brouillon complet avec un prestataire disponible part", () => {
  assert.deepEqual(planSend(base), { ok: true, providerId: "p1" });
});

test("un brief déjà envoyé ne repart pas (double clic)", () => {
  for (const status of ["envoye", "devis", "annule", "verse"] as const) {
    assert.deepEqual(planSend({ ...base, status }), { ok: false, reason: "not_a_draft", issues: [] }, status);
  }
});

test("un brief incomplet est refusé champ par champ, avant même de chercher un prestataire", () => {
  const r = planSend({ ...base, answers: { ...full, idea: "", deciders_attested: false }, providers: [] });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "invalid_brief");
    assert.deepEqual(r.issues.map((i) => `${i.key}:${i.code}`).sort(), ["deciders_attested:not_attested", "idea:missing"]);
  }
});

test("complet mais aucun prestataire disponible : refus nommé, le brouillon reste", () => {
  assert.deepEqual(planSend({ ...base, providers: [] }), { ok: false, reason: "no_provider", issues: [] });
  assert.deepEqual(planSend({ ...base, providers: [prov({ metiers: ["photo"] })] }), { ok: false, reason: "no_provider", issues: [] });
});
