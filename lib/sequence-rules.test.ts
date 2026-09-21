import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideMemberSequence,
  dueStep,
  evaluateSequence,
  isHoldout,
  stableBucket,
  type HistoryRow,
  type MemberState,
} from "./sequence-rules";

const NOW = new Date("2026-09-22T16:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const ALL = new Set(["first_ticket", "install_app", "referral_nudge", "team_invite"]);

// Un identifiant qui ne tombe PAS dans le témoin pour les séquences testées.
const TREATED = (() => {
  for (let i = 0; i < 1000; i++) {
    const id = `membre-${i}`;
    if (["first_ticket", "install_app", "referral_nudge", "team_invite"].every((k) => !isHoldout(id, k))) return id;
  }
  throw new Error("aucun identifiant hors témoin");
})();

function member(over: Partial<MemberState> = {}): MemberState {
  return {
    userId: TREATED,
    joinedAt: daysAgo(2),
    hasTeam: false,
    validatedCount: 0,
    firstValidatedAt: null,
    installed: false,
    lastRedeemedAt: null,
    hasTeamChoices: true,
    optedOut: new Set(),
    history: [],
    ...over,
  };
}

const sent = (key: string, step: number | null, ago: number, status = "sent", channel = "email"): HistoryRow => ({
  key, step, status, channel, createdAt: daysAgo(ago),
});

test("étape due : dans sa fenêtre, jamais deux fois, jamais en rattrapage", () => {
  assert.equal(dueStep(1.5, [2, 7, 21], []), null);
  assert.equal(dueStep(2, [2, 7, 21], []), 1);
  assert.equal(dueStep(5.1, [2, 7, 21], []), null, "fenêtre de l'étape 1 passée, étape 2 pas encore due");
  assert.equal(dueStep(8, [2, 7, 21], [1]), 2);
  assert.equal(dueStep(8, [2, 7, 21], [2]), null);
  assert.equal(dueStep(60, [2, 7, 21], []), null, "un inscrit d'il y a deux mois ne reçoit rien");
});

test("premier ticket : J+2 puis J+7, et plus rien après un ticket", () => {
  assert.deepEqual(decideMemberSequence(member(), ALL, NOW), { key: "first_ticket", step: 1, holdout: false });
  const j7 = member({ joinedAt: daysAgo(7), history: [sent("first_ticket", 1, 5)] });
  assert.deepEqual(decideMemberSequence(j7, ALL, NOW), { key: "first_ticket", step: 2, holdout: false });
  assert.equal(evaluateSequence("first_ticket", member({ validatedCount: 1 }), NOW), null);
});

test("un échec d'envoi ne compte pas : l'étape repart le lendemain", () => {
  const s = member({ joinedAt: daysAgo(3), history: [sent("first_ticket", 1, 1, "failed")] });
  assert.deepEqual(decideMemberSequence(s, ALL, NOW), { key: "first_ticket", step: 1, holdout: false });
});

test("deux séquences différentes : jamais à moins d'une semaine", () => {
  const s = member({
    validatedCount: 1,
    firstValidatedAt: daysAgo(3),
    joinedAt: daysAgo(20),
    history: [sent("first_ticket", 3, 2)],
  });
  assert.equal(decideMemberSequence(s, ALL, NOW), null);
  assert.deepEqual(decideMemberSequence({ ...s, history: [sent("first_ticket", 3, 8)] }, ALL, NOW), { key: "install_app", step: 1, holdout: false });
});

test("priorité : l'app avant l'équipe", () => {
  const s = member({ validatedCount: 2, firstValidatedAt: daysAgo(10), joinedAt: daysAgo(40), installed: false });
  // install_app : J+3 passé de 7 jours (hors fenêtre) → l'équipe passe.
  assert.deepEqual(decideMemberSequence(s, ALL, NOW), { key: "team_invite", step: null, holdout: false });
  const fresh = member({ validatedCount: 1, firstValidatedAt: daysAgo(3), joinedAt: daysAgo(40) });
  assert.equal(decideMemberSequence(fresh, ALL, NOW)?.key, "install_app");
});

test("éteinte ou arrêtée par le membre : rien", () => {
  assert.equal(decideMemberSequence(member(), new Set(["team_invite"]), NOW), null);
  assert.equal(decideMemberSequence(member({ optedOut: new Set(["first_ticket"]) }), ALL, NOW), null);
});

test("invite tes amis : le lendemain d'un cadeau récupéré, une fois par 14 jours", () => {
  const s = member({ validatedCount: 3, firstValidatedAt: daysAgo(30), joinedAt: daysAgo(40), installed: true, hasTeam: true, lastRedeemedAt: hoursAgo(26) });
  assert.equal(decideMemberSequence(s, ALL, NOW)?.key, "referral_nudge");
  assert.equal(decideMemberSequence({ ...s, lastRedeemedAt: hoursAgo(3) }, ALL, NOW), null, "pas le jour même");
  assert.equal(decideMemberSequence({ ...s, history: [sent("referral_nudge", null, 10)] }, ALL, NOW), null);
});

test("équipe : sans communauté à proposer, rien ; une fois par semestre", () => {
  const s = member({ validatedCount: 2, firstValidatedAt: daysAgo(10), joinedAt: daysAgo(40), installed: true });
  assert.equal(decideMemberSequence({ ...s, hasTeamChoices: false }, ALL, NOW), null);
  assert.equal(decideMemberSequence({ ...s, history: [sent("team_invite", null, 100)] }, ALL, NOW), null);
  assert.equal(decideMemberSequence({ ...s, history: [sent("team_invite", null, 200)] }, ALL, NOW)?.key, "team_invite");
});

test("témoin : stable pour un membre et une séquence, environ 10 %", () => {
  assert.equal(stableBucket("abc", "first_ticket"), stableBucket("abc", "first_ticket"));
  let held = 0;
  for (let i = 0; i < 5000; i++) if (isHoldout(`u-${i}`, "first_ticket")) held++;
  assert.ok(held > 350 && held < 650, `${held} sur 5000`);
});

test("un tirage témoin compte comme un envoi : même rythme que les autres", () => {
  const s = member({ joinedAt: daysAgo(8), history: [sent("first_ticket", 1, 6, "holdout", "none")] });
  assert.equal(decideMemberSequence(s, ALL, NOW)?.step, 2);
  assert.equal(decideMemberSequence({ ...s, history: [sent("first_ticket", 2, 1, "holdout", "none")] }, ALL, NOW), null);
  // Un témoin d'une autre séquence bloque aussi la semaine.
  const other = member({ validatedCount: 1, firstValidatedAt: daysAgo(3), joinedAt: daysAgo(40), history: [sent("team_invite", null, 2, "holdout", "none")] });
  assert.equal(decideMemberSequence(other, ALL, NOW), null);
});
