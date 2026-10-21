import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, percent, type StatsMission } from "./mission-stats";

const m = (id: string, o: Partial<StatsMission> = {}): StatsMission => ({ id, metier: "video", status: "envoye", quoteCents: null, providerCents: null, cancelledBy: null, createdAt: "2026-10-01T10:00:00Z", ...o });
const none = new Map<string, Set<string>>();
const step = (s: ReturnType<typeof computeStats>["all"], key: string) => s.funnel.find((f) => f.key === key)!;

test("un brouillon n'est pas un brief envoyé", () => {
  const s = computeStats([m("a", { status: "brief" }), m("b")], none, ["video"]);
  assert.equal(s.all.sent, 1);
  assert.equal(step(s.all, "sent").count, 1);
});

test("l'entonnoir compte les missions qui ont ATTEINT une étape, pas celles qui y sont", () => {
  const reached = new Map([["c", new Set(["devis", "accepte", "livre"])]]);
  const s = computeStats([m("a"), m("b", { status: "devis" }), m("c", { status: "annule" }), m("d", { status: "verse", quoteCents: 100_000, providerCents: 87_500 })], reached, ["video"]);
  assert.deepEqual(s.all.funnel.map((f) => f.count), [4, 3, 2, 2, 1]);
});

test("la part se calcule sur les briefs envoyés ; aucun brief : pas de pourcentage", () => {
  const s = computeStats([m("a"), m("b", { status: "devis" })], none, ["video"]);
  assert.equal(step(s.all, "quoted").share, 0.5);
  assert.equal(percent(0.5), "50 %");
  assert.equal(percent(null), "—");
  const empty = computeStats([], none, ["video"]);
  assert.equal(step(empty.all, "sent").share, null);
});

test("le volume et la commission ne comptent que les missions validées ou versées", () => {
  const s = computeStats(
    [
      m("a", { status: "valide", quoteCents: 100_000, providerCents: 87_500 }),
      m("b", { status: "verse", quoteCents: 200_000, providerCents: 175_000 }),
      m("c", { status: "production", quoteCents: 300_000, providerCents: 262_500 }),
      m("d", { status: "annule", quoteCents: 50_000, providerCents: 43_750, cancelledBy: "restaurant" }),
    ],
    none,
    ["video"]
  );
  assert.equal(s.all.completed, 2);
  assert.equal(s.all.volumeCents, 300_000);
  assert.equal(s.all.providerCents, 262_500);
  assert.equal(s.all.commissionCents, 37_500);
});

test("annulations par auteur et litiges (en cours ou passés)", () => {
  const reached = new Map([["b", new Set(["litige"])]]);
  const s = computeStats(
    [m("a", { status: "annule", cancelledBy: "restaurant" }), m("b", { status: "verse" }), m("c", { status: "litige" }), m("d", { status: "annule", cancelledBy: "provider" }), m("e", { status: "annule" })],
    reached,
    ["video"]
  );
  assert.equal(s.all.cancelled, 3);
  assert.deepEqual(s.all.cancelledBy, { restaurant: 1, provider: 1, inconnu: 1 });
  assert.equal(s.all.disputes, 2);
});

test("chaque métier a son bloc, et la somme des métiers retombe sur le total", () => {
  const list = [m("a", { metier: "video" }), m("b", { metier: "photo" }), m("c", { metier: "design", status: "valide", quoteCents: 10_000, providerCents: 8_750 }), m("d", { metier: "impression" })];
  const s = computeStats(list, none, ["video", "photo", "design", "impression"]);
  assert.equal(Object.values(s.byMetier).reduce((a, b) => a + b.sent, 0), s.all.sent);
  assert.equal(s.byMetier.design.commissionCents, 1_250);
  assert.equal(s.byMetier.photo.sent, 1);
});

test("aucune commission négative, même si les montants sont incohérents", () => {
  const s = computeStats([m("a", { status: "valide", quoteCents: 100, providerCents: 200 })], none, ["video"]);
  assert.equal(s.all.commissionCents, 0);
});
