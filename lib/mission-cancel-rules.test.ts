import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANCEL_ISSUE_TEXT,
  PROVIDER_REASONS,
  RESTAURANT_REASONS,
  WARNINGS_BEFORE_REDUCTION,
  actorForFault,
  applySanction,
  canCancel,
  describeCost,
  isMissedShoot,
  describeSettlement,
  quoteCancellation,
  quotePlatformCancellation,
  settlementOf,
  sanitizeCancel,
  sanctionLabel,
  validateCancel,
  type CancelFacts,
} from "./mission-cancel-rules";
import { MISSION_STATUSES } from "./mission-states";

const euros = (c: number) => `${c / 100} €`;
// Mardi 27 octobre 2026, 09:30 à Bruxelles = 08:30 UTC (heure d'hiver).
const facts = (over: Partial<CancelFacts> = {}): CancelFacts => ({
  by: "restaurant",
  status: "date_bloquee",
  shootDate: "2026-10-27",
  shootStart: "09:30",
  paidCents: 100_000,
  providerCents: 87_500,
  now: new Date("2026-10-10T08:00:00Z"), // 16 jours avant
  ...over,
});

// ── qui peut annuler quoi ──
test("le restaurateur annule jusqu'à la date réservée ; pas pendant ni après le tournage", () => {
  for (const s of ["brief", "envoye", "devis", "accepte", "date_bloquee", "suspendu"] as const) assert.equal(canCancel("restaurant", s), true, s);
  for (const s of ["production", "livre", "retouche", "valide", "verse", "annule", "litige"] as const) assert.equal(canCancel("restaurant", s), false, s);
});

test("le prestataire n'annule qu'après le devis accepté ; avant, il refuse (avec sa propre raison)", () => {
  for (const s of ["accepte", "date_bloquee"] as const) assert.equal(canCancel("provider", s), true, s);
  for (const s of MISSION_STATUSES.filter((x) => x !== "accepte" && x !== "date_bloquee")) assert.equal(canCancel("provider", s), false, s);
});

// ── les raisons ──
test("une raison de la liste ; « autre » demande un mot", () => {
  assert.deepEqual(validateCancel("restaurant", { reason: RESTAURANT_REASONS[0], note: "" }), { ok: true });
  assert.deepEqual(validateCancel("provider", { reason: PROVIDER_REASONS[0], note: "" }), { ok: true });
  assert.deepEqual(validateCancel("restaurant", { reason: "Parce que", note: "" }), { ok: false, issue: "reason_unknown" });
  assert.deepEqual(validateCancel("restaurant", { reason: "Je suis malade", note: "" }), { ok: false, issue: "reason_unknown" }); // la liste du prestataire n'est pas la sienne
  assert.deepEqual(validateCancel("restaurant", { reason: "Autre raison", note: "" }), { ok: false, issue: "note_required" });
  assert.deepEqual(validateCancel("restaurant", { reason: "Autre raison", note: "La hotte est cassée" }), { ok: true });
  assert.deepEqual(validateCancel("restaurant", { reason: RESTAURANT_REASONS[0], note: "x".repeat(501) }), { ok: false, issue: "note_too_long" });
});

test("une entrée du réseau est ramenée", () => {
  assert.deepEqual(sanitizeCancel(null), { reason: "", note: "" });
  assert.deepEqual(sanitizeCancel({ reason: ` ${RESTAURANT_REASONS[1]} `, note: "  ok  " }), { reason: RESTAURANT_REASONS[1], note: "ok" });
  assert.equal(sanitizeCancel({ note: "x".repeat(9000) }).note.length, 501);
  for (const k of ["reason_unknown", "note_required", "note_too_long"] as const) assert.ok(CANCEL_ISSUE_TEXT[k].length > 10);
});

// ── le coût, maintenant ──
test("restaurateur, 16 jours avant : gratuit, remboursé en entier", () => {
  const q = quoteCancellation(facts());
  assert.equal(q.band, "free");
  assert.equal(q.outcome.refundCents, 100_000);
  assert.equal(q.outcome.retainedCents, 0);
  assert.equal(q.beforeDate, false);
});

test("restaurateur, 3 jours avant : la moitié ; la veille : tout", () => {
  const half = quoteCancellation(facts({ now: new Date("2026-10-24T08:00:00Z") })); // 72,5 h
  assert.equal(half.band, "half");
  assert.equal(half.outcome.retainedCents, 50_000);
  assert.equal(half.outcome.providerPayoutCents, 43_750);
  const full = quoteCancellation(facts({ now: new Date("2026-10-26T08:00:00Z") })); // 24,5 h
  assert.equal(full.band, "full");
  assert.equal(full.outcome.retainedCents, 100_000);
});

test("la frontière des 7 jours se compte en heures réelles, à la minute", () => {
  // Le tournage est le 27/10 à 09:30 à Bruxelles (UTC+1 après le 25/10) = 08:30 UTC. Sept jours = 168 h réelles avant.
  assert.equal(quoteCancellation(facts({ now: new Date("2026-10-20T08:29:00Z") })).band, "free"); // 168 h 01 min
  assert.equal(quoteCancellation(facts({ now: new Date("2026-10-20T08:31:00Z") })).band, "half"); // 167 h 59 min
  // La frontière des 48 h : 08:30 UTC le 25/10.
  assert.equal(quoteCancellation(facts({ now: new Date("2026-10-25T08:29:00Z") })).band, "half"); // 48 h 01 min
  assert.equal(quoteCancellation(facts({ now: new Date("2026-10-25T08:31:00Z") })).band, "full"); // 47 h 59 min
});

test("sans date réservée, rien à perdre : le devis accepté s'annule gratuitement", () => {
  for (const status of ["brief", "envoye", "devis", "accepte"] as const) {
    const q = quoteCancellation(facts({ status, shootDate: null, shootStart: null, paidCents: status === "accepte" ? 100_000 : 0, now: new Date("2026-10-26T08:00:00Z") }));
    assert.equal(q.beforeDate, true, status);
    assert.equal(q.band, "free", status);
    assert.equal(q.outcome.retainedCents, 0, status);
  }
});

test("le prestataire qui annule ne coûte jamais rien au restaurateur ; la sanction suit la bande", () => {
  const free = quoteCancellation(facts({ by: "provider" }));
  const half = quoteCancellation(facts({ by: "provider", now: new Date("2026-10-24T08:00:00Z") }));
  const full = quoteCancellation(facts({ by: "provider", now: new Date("2026-10-26T08:00:00Z") }));
  for (const q of [free, half, full]) {
    assert.equal(q.outcome.refundCents, 100_000);
    assert.equal(q.outcome.retainedCents, 0);
  }
  assert.deepEqual([free, half, full].map((q) => q.outcome.providerSanction), ["none", "avertissement", "penalite"]);
});

test("un prestataire qui annule sans date réservée n'est pas sanctionné", () => {
  const q = quoteCancellation(facts({ by: "provider", status: "accepte", shootDate: null, shootStart: null, now: new Date("2026-10-26T08:00:00Z") }));
  assert.equal(q.outcome.providerSanction, "none");
});

test("absent le jour J : tout est dû, quelle que soit l'heure", () => {
  const q = quoteCancellation(facts({ noShow: true, now: new Date("2026-10-01T08:00:00Z") }));
  assert.equal(q.band, "full");
  assert.equal(q.outcome.retainedCents, 100_000);
});

test("somme conservée : rendu + retenu = payé, à toutes les bandes", () => {
  for (const now of ["2026-10-10", "2026-10-24", "2026-10-26", "2026-10-28"]) {
    const q = quoteCancellation(facts({ now: new Date(`${now}T08:00:00Z`), paidCents: 33_333, providerCents: 29_166 }));
    assert.equal(q.outcome.refundCents + q.outcome.retainedCents, 33_333, now);
  }
});

test("la phrase lue avant d'annuler dit le coût en euros côté restaurateur, la sanction côté prestataire", () => {
  const half = quoteCancellation(facts({ now: new Date("2026-10-24T08:00:00Z") }));
  assert.match(describeCost("restaurant", half, euros), /la moitié est due \(500 €\)/);
  const full = quoteCancellation(facts({ now: new Date("2026-10-26T08:00:00Z") }));
  assert.match(describeCost("restaurant", full, euros), /tout est dû \(1000 €\)/);
  assert.match(describeCost("restaurant", quoteCancellation(facts()), euros), /gratuite/);
  const pHalf = quoteCancellation(facts({ by: "provider", now: new Date("2026-10-24T08:00:00Z") }));
  const pFull = quoteCancellation(facts({ by: "provider", now: new Date("2026-10-26T08:00:00Z") }));
  assert.match(describeCost("provider", pHalf, euros), /avertissement/);
  assert.match(describeCost("provider", pFull, euros), /visibilité est réduite/);
  assert.doesNotMatch(describeCost("provider", pFull, euros), /€/); // le prestataire ne lit jamais d'euro dans cette phrase
  assert.match(describeCost("restaurant", quoteCancellation(facts({ status: "accepte", shootDate: null, shootStart: null })), euros), /Aucune date/);
});

// ── sanctions ──
const ok = { warnings: 0, visibility_reduced: false, status: "active" };

test("un avertissement s'ajoute, rien d'autre", () => {
  assert.deepEqual(applySanction(ok, "avertissement"), { warnings: 1, visibility_reduced: false, status: "active", changed: true });
});

test("une pénalité réduit la visibilité ; une seconde pénalité exclut", () => {
  const first = applySanction(ok, "penalite");
  assert.deepEqual([first.warnings, first.visibility_reduced, first.status], [1, true, "active"]);
  const second = applySanction(first, "penalite");
  assert.deepEqual([second.warnings, second.visibility_reduced, second.status], [2, true, "excluded"]);
});

test("trois avertissements réduisent la visibilité à eux seuls", () => {
  let s = ok;
  for (let i = 0; i < WARNINGS_BEFORE_REDUCTION; i++) s = applySanction(s, "avertissement");
  assert.equal(s.visibility_reduced, true);
  assert.equal(s.status, "active");
});

test("aucune sanction ne change rien ; un prestataire suspendu ne devient pas exclu par une pénalité", () => {
  assert.deepEqual(applySanction(ok, "none"), { ...ok, changed: false });
  const r = applySanction({ warnings: 1, visibility_reduced: true, status: "suspended" }, "penalite");
  assert.equal(r.status, "suspended");
});

test("libellés de sanction", () => {
  assert.equal(sanctionLabel("none"), "aucune");
  assert.equal(sanctionLabel("avertissement"), "avertissement");
  assert.match(sanctionLabel("penalite"), /visibilité réduite/);
});

// ── la plateforme arbitre ──
test("force majeure : tout est remboursé, personne n'est sanctionné, même la veille", () => {
  const q = quotePlatformCancellation({ ...facts({ now: new Date("2026-10-26T08:00:00Z") }), fault: "none" });
  assert.equal(q.band, "free");
  assert.equal(q.outcome.refundCents, 100_000);
  assert.equal(q.outcome.retainedCents, 0);
  assert.equal(q.sanction, "none");
});

test("faute du restaurateur : le barème s'applique, aucune sanction de prestataire", () => {
  const q = quotePlatformCancellation({ ...facts({ now: new Date("2026-10-26T08:00:00Z") }), fault: "restaurant" });
  assert.equal(q.band, "full");
  assert.equal(q.outcome.retainedCents, 100_000);
  assert.equal(q.sanction, "none");
});

test("faute du prestataire : remboursé en entier et sanctionné selon la bande", () => {
  const q = quotePlatformCancellation({ ...facts({ now: new Date("2026-10-26T08:00:00Z") }), fault: "provider" });
  assert.equal(q.outcome.refundCents, 100_000);
  assert.equal(q.sanction, "penalite");
});

test("un tournage absent : le jour est passé, la plateforme tranche", () => {
  assert.equal(isMissedShoot("date_bloquee", "2026-10-27", "2026-10-28"), true);
  assert.equal(isMissedShoot("date_bloquee", "2026-10-27", "2026-10-27"), false); // le jour J lui-même, il peut encore arriver
  assert.equal(isMissedShoot("production", "2026-10-27", "2026-10-28"), false);
  assert.equal(isMissedShoot("date_bloquee", null, "2026-10-28"), false);
  assert.equal(actorForFault("restaurant"), "restaurant");
  assert.equal(actorForFault("provider"), "provider");
  assert.equal(actorForFault("none"), "provider");
});

// ── le règlement à la main ──
test("le restaurateur n'a versé que l'acompte : on réclame le reste dû, on rend le trop-perçu", () => {
  assert.deepEqual(settlementOf(100_000, 20_000), { direction: "collect", cents: 80_000 }); // tout est dû, 20 % déjà versés
  assert.deepEqual(settlementOf(50_000, 20_000), { direction: "collect", cents: 30_000 }); // la moitié due
  assert.deepEqual(settlementOf(0, 20_000), { direction: "refund", cents: 20_000 }); // gratuit : l'acompte est rendu
  assert.deepEqual(settlementOf(20_000, 20_000), { direction: "none", cents: 0 });
  assert.deepEqual(settlementOf(0, 0), { direction: "none", cents: 0 });
  assert.deepEqual(settlementOf(40_000, -5), { direction: "collect", cents: 40_000 }); // un acompte négatif ne se lit jamais comme un crédit
});

test("la phrase de règlement", () => {
  assert.equal(describeSettlement({ direction: "collect", cents: 8_000 }, euros), "À réclamer au restaurateur : 80 €");
  assert.equal(describeSettlement({ direction: "refund", cents: 2_000 }, euros), "À rendre au restaurateur : 20 €");
  assert.equal(describeSettlement({ direction: "none", cents: 0 }, euros), "Rien à régler");
});
