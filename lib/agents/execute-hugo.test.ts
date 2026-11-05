import { test } from "node:test";
import assert from "node:assert/strict";
import { executeLapsedCampaign, type LapsedDeps } from "./execute-hugo";
import { HUGO_WINBACK_KEY, selectLapsed, type HugoLapsedInput, type HugoMember } from "./hugo";
import type { BroadcastResult } from "../broadcast";
import type { SendRecord } from "../message-log";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-05T12:00:00Z");
const MESSAGE = "Ça fait un moment ! Viens voir ce que tes points te permettent d'avoir chez Chez Demo 😊";

const members: HugoMember[] = Array.from({ length: 60 }, (_, i) => ({
  userId: `m${String(i).padStart(3, "0")}`,
  lastOrderAt: new Date(NOW - 30 * DAY).toISOString(),
  orders: 3,
  promoConsent: true,
  lastContactAt: null,
}));

const input: HugoLapsedInput = {
  restaurantId: "demo-x",
  restaurantName: "Chez Demo",
  todayISO: "2026-11-05",
  nowMs: NOW,
  pct: 0.04,
  members,
};

type Fake = { deps: LapsedDeps; events: string[]; records: SendRecord[]; sentTo: string[][]; discarded: string[] };

/** Des dépendances factices qui journalisent l'ordre des appels, pour prouver « les témoins d'abord ». */
function fake(over: Partial<LapsedDeps> & { recordFails?: (r: SendRecord) => boolean; state?: "none" | "exists" | "unavailable" } = {}): Fake {
  const f: Fake = { deps: undefined as unknown as LapsedDeps, events: [], records: [], sentTo: [], discarded: [] };
  f.deps = {
    async load() {
      f.events.push("load");
      return input;
    },
    async campaignState() {
      f.events.push("state");
      return over.state ?? "none";
    },
    async record(r) {
      f.events.push(`record:${r.status}`);
      if (over.recordFails?.(r)) return null;
      f.records.push(r);
      return `id-${f.records.length}`;
    },
    async discard(campaignId) {
      f.events.push("discard");
      f.discarded.push(campaignId);
    },
    async send(_message, userIds): Promise<BroadcastResult> {
      f.events.push("send");
      f.sentTo.push(userIds);
      return { targeted: userIds.length, sent: userIds.length, skipped: 0, sentTo: userIds.map((userId) => ({ userId, channel: "push" as const })) };
    },
    ...("load" in over ? { load: over.load } : {}),
  } as LapsedDeps;
  return f;
}

test("la relance : les témoins sont inscrits AVANT le premier envoi, puis chaque envoi est inscrit", async () => {
  const f = fake();
  const r = await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  assert.ok(r.ok);
  const sel = selectLapsed(input);

  const sendAt = f.events.indexOf("send");
  assert.ok(sendAt > 0);
  assert.equal(f.events.slice(0, sendAt).filter((e) => e === "record:holdout").length, sel.holdout.length);
  assert.ok(!f.events.slice(0, sendAt).includes("record:sent"));
  assert.equal(f.events.slice(sendAt + 1).filter((e) => e === "record:sent").length, sel.treated.length);

  assert.equal(r.campaignId, "hugo_winback:demo-x:2026-11-05");
  assert.equal(r.treated, sel.treated.length);
  assert.equal(r.holdout, sel.holdout.length);
  assert.equal(r.sent, sel.treated.length);
  assert.equal(r.unrecorded, 0);
});

test("seuls les traités reçoivent le message : jamais un témoin", async () => {
  const f = fake();
  await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  const sel = selectLapsed(input);
  assert.deepEqual(f.sentTo[0], sel.treated);
  assert.ok(sel.holdout.every((id) => !f.sentTo[0].includes(id)));
});

test("le journal : témoins en « holdout » sans canal, envois en « sent » avec leur vrai canal, même campagne et même clé", async () => {
  const f = fake();
  await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  const holdouts = f.records.filter((r) => r.status === "holdout");
  const sents = f.records.filter((r) => r.status === "sent");
  assert.ok(holdouts.length > 0 && sents.length > 0);
  assert.ok(holdouts.every((r) => r.channel === "none"));
  assert.ok(sents.every((r) => r.channel === "push"));
  assert.ok(f.records.every((r) => r.messageKey === HUGO_WINBACK_KEY && r.audience === "member" && r.restaurantId === "demo-x"));
  assert.equal(new Set(f.records.map((r) => r.campaignId)).size, 1);
});

test("un message avec un euro est refusé avant toute lecture ou tout envoi", async () => {
  const f = fake();
  const r = await executeLapsedCampaign({ restaurantId: "demo-x", message: "−2 € pour toi", nowMs: NOW }, f.deps);
  assert.deepEqual(r, { ok: false, error: "Pas de montant en euros dans un message aux membres." });
  assert.deepEqual(f.events, []);
});

test("la liste a fondu depuis la proposition : on ne relance pas une poignée de clients", async () => {
  const f = fake({ load: async () => ({ ...input, members: members.slice(0, 5) }) });
  const r = await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  assert.equal(r.ok, false);
  assert.ok(!f.events.includes("send"));
});

test("une relance par jour : la rejouer ne renvoie rien et n'inscrit rien", async () => {
  const f = fake({ state: "exists" });
  const r = await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  assert.deepEqual(r, { ok: false, error: "Cette relance a déjà été lancée aujourd'hui." });
  assert.ok(!f.events.includes("send") && !f.events.some((e) => e.startsWith("record")));
});

test("journal illisible : rien ne part (sans lui, l'effet ne se mesure pas)", async () => {
  const f = fake({ state: "unavailable" });
  const r = await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /journal/i);
  assert.ok(!f.events.includes("send"));
});

test("un témoin qui ne s'inscrit pas annule tout : lignes retirées, rien d'envoyé", async () => {
  const f = fake({ recordFails: (r) => r.status === "holdout" });
  const r = await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  assert.equal(r.ok, false);
  assert.ok(f.events.includes("discard"));
  assert.deepEqual(f.discarded, ["hugo_winback:demo-x:2026-11-05"]);
  assert.ok(!f.events.includes("send"));
});

test("un envoi parti mais non inscrit est compté, jamais caché", async () => {
  const sel = selectLapsed(input);
  const f = fake({ recordFails: (r) => r.status === "sent" && r.userId === sel.treated[0] });
  const r = await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  assert.ok(r.ok);
  assert.equal(r.unrecorded, 1);
  assert.equal(r.sent, sel.treated.length);
});

test("ce que le plafond hebdomadaire retient est rendu tel quel", async () => {
  const f = fake();
  f.deps.send = async (_m, userIds) => ({ targeted: userIds.length, sent: userIds.length - 3, skipped: 3, sentTo: userIds.slice(3).map((userId) => ({ userId, channel: "in_app" as const })) });
  const r = await executeLapsedCampaign({ restaurantId: "demo-x", message: MESSAGE, nowMs: NOW }, f.deps);
  assert.ok(r.ok);
  assert.equal(r.skipped, 3);
  assert.equal(f.records.filter((x) => x.status === "sent").length, r.sent);
});
