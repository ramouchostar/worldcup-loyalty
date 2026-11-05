import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptEmmaIdea, requestFromIdea, type AcceptDeps } from "./execute-emma";
import { emmaDecision, type EmmaInput } from "./emma";
import { judgeRequest, type Creative } from "../ads/meta-spec";
import type { Billing } from "../ads/requests";

const TODAY = "2026-11-05";
const creative: Creative = { kind: "instagram_post", mediaId: "17900000000000001", mediaType: "IMAGE", permalink: null, thumbnail: null };
const stored: Billing = { legalName: "Demo SRL", vatNumber: null, address: "1 rue de la Demo, 1000 Bruxelles" };

const input: EmmaInput = {
  restaurantId: "demo-x",
  todayISO: TODAY,
  pubOpen: true,
  requestInFlight: false,
  offer: { productName: "Burger", discountPct: 30, weekday: 3 },
  creative,
  feePct: 15,
  negotiatedFee: false,
  vatRate: 0,
  estimate: null,
};

type Calls = { events: string[]; created: Record<string, unknown>[]; origins: { id: string; evidence: unknown }[] };

function fake(over: Partial<AcceptDeps> = {}): { deps: AcceptDeps; calls: Calls } {
  const calls: Calls = { events: [], created: [], origins: [] };
  const deps: AcceptDeps = {
    async decide() {
      calls.events.push("decide");
      return emmaDecision(input);
    },
    async billing() {
      calls.events.push("billing");
      return stored;
    },
    async create(_r, _u, raw) {
      calls.events.push("create");
      calls.created.push(raw);
      return { ok: true, requestId: "req-1" };
    },
    async markOrigin(id, evidence) {
      calls.events.push("origin");
      calls.origins.push({ id, evidence });
      return null;
    },
    ...over,
  };
  return { deps, calls };
}

const args = (extras: Parameters<typeof acceptEmmaIdea>[0]["extras"]) => ({ restaurantId: "demo-x", userId: "u1", isSuperAdmin: false, todayISO: TODAY, extras });

test("le « Oui » crée la demande existante avec la proposition, la facturation enregistrée et les conditions cochées", async () => {
  const { deps, calls } = fake();
  const r = await acceptEmmaIdea(args({ termsAccepted: true }), deps);
  assert.deepEqual(r, { ok: true, requestId: "req-1" });

  const raw = calls.created[0];
  assert.equal(raw.objective, "TRAFIC");
  assert.equal(raw.budgetEuros, 168);
  assert.equal(raw.radiusKm, 3);
  assert.deepEqual(raw.billing, stored);
  assert.equal(raw.termsAccepted, true);
  // … et le formulaire de la Pub l'accepte tel quel.
  const judged = judgeRequest(raw, TODAY);
  assert.ok(judged.ok, judged.ok ? "" : judged.issue);
});

test("sans les conditions cochées par le gérant : rien n'est lu, rien n'est créé", async () => {
  for (const terms of [false, undefined, "true", 1, null]) {
    const { deps, calls } = fake();
    const r = await acceptEmmaIdea(args({ termsAccepted: terms }), deps);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /conditions de la Pub/);
    assert.deepEqual(calls.events, []);
  }
});

test("l'idée est recalculée au moment du « Oui » : périmée, elle ne crée rien et dit pourquoi", async () => {
  const { deps, calls } = fake({ decide: async () => emmaDecision({ ...input, requestInFlight: true }) });
  const r = await acceptEmmaIdea(args({ termsAccepted: true }), deps);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /n'est plus d'actualité\. Une pub est déjà demandée/);
  assert.ok(!calls.events.includes("create"));
});

test("le gérant peut remplacer la création proposée, et saisir sa facturation à la première demande", async () => {
  const { deps, calls } = fake();
  const upload = { kind: "upload", path: "demo-x/video.mp4", mime: "video/mp4" };
  const billing: Billing = { legalName: "Autre SRL", vatNumber: "BE0123456789", address: "2 rue de l'Autre, 1050 Bruxelles" };
  await acceptEmmaIdea(args({ termsAccepted: true, creative: upload, billing }), deps);
  assert.deepEqual(calls.created[0].creative, upload);
  assert.deepEqual(calls.created[0].billing, billing);
  assert.ok(!calls.events.includes("billing")); // la facturation saisie prime, on ne relit pas l'ancienne
});

test("sans facturation du tout, le formulaire refuse (pas d'invention) et la demande échoue avec son message", async () => {
  const { deps, calls } = fake({ billing: async () => null, create: async (_r, _u, raw) => { const j = judgeRequest(raw, TODAY); return j.ok ? { ok: true, requestId: "x" } : { ok: false, error: `refusée : ${j.issue}` }; } });
  const r = await acceptEmmaIdea(args({ termsAccepted: true }), deps);
  assert.deepEqual(r, { ok: false, error: "refusée : billing_name" });
  assert.deepEqual(calls.origins, []);
});

test("une demande refusée ne note aucune origine", async () => {
  const { deps, calls } = fake({ create: async () => ({ ok: false, error: "Ton fichier n'est pas arrivé : renvoie-le." }) });
  const r = await acceptEmmaIdea(args({ termsAccepted: true }), deps);
  assert.deepEqual(r, { ok: false, error: "Ton fichier n'est pas arrivé : renvoie-le." });
  assert.ok(!calls.events.includes("origin"));
});

test("la demande créée garde son origine « Emma » et les chiffres de l'idée", async () => {
  const { deps, calls } = fake();
  await acceptEmmaIdea(args({ termsAccepted: true }), deps);
  assert.equal(calls.origins[0].id, "req-1");
  assert.equal((calls.origins[0].evidence as Record<string, unknown>).product, "Burger");
  assert.equal((calls.origins[0].evidence as Record<string, unknown>).budgetEuros, 168);
});

test("origine impossible à noter : la demande reste créée et l'avertissement est rendu, jamais caché", async () => {
  const { deps } = fake({ markOrigin: async () => "column origin does not exist" });
  const r = await acceptEmmaIdea(args({ termsAccepted: true }), deps);
  assert.ok(r.ok);
  assert.equal(r.requestId, "req-1");
  assert.match(r.warning ?? "", /origine .* n'a pas pu être notée/);
});

test("requestFromIdea ne fabrique jamais d'acceptation : seul `true` passe", () => {
  const d = emmaDecision(input);
  assert.ok(d.idea);
  assert.equal(requestFromIdea(d.idea, stored, { termsAccepted: true }).termsAccepted, true);
  assert.equal(requestFromIdea(d.idea, stored, { termsAccepted: "oui" }).termsAccepted, false);
  assert.equal(requestFromIdea(d.idea, stored, { termsAccepted: undefined }).termsAccepted, false);
});
