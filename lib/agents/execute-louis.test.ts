import { test } from "node:test";
import assert from "node:assert/strict";
import { validateApproval } from "./execute-louis";
import { approvedForTeam, replyCards, repliesYesLabel, reviewWhen } from "./ideas-view";
import type { LouisReply } from "./louis";

const proposed: LouisReply[] = [
  { ref: "aaaaaaaaaaaa", rating: 5, date: "2026-11-08", excerpt: "Les nuggets étaient parfaits.", text: "Merci beaucoup pour votre message, nous le transmettons à l'équipe.", lang: "fr", careful: false },
  { ref: "bbbbbbbbbbbb", rating: 1, date: "2026-11-05", excerpt: "Poulet pas assez cuit.", text: "Merci d'avoir pris le temps de nous écrire. Nous regrettons cette expérience.", lang: "fr", careful: true },
];

test("validation : les réponses gardées reviennent telles quelles, une modification est notée", () => {
  const r = validateApproval(proposed, [
    { ref: "aaaaaaaaaaaa", text: proposed[0].text },
    { ref: "bbbbbbbbbbbb", text: "Merci d'avoir pris le temps de nous écrire. Nous sommes désolés pour cette expérience." },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.approved.map((a) => a.edited), [false, true]);
});

test("validation : écarter un avis suffit, il suffit de ne pas le renvoyer", () => {
  const r = validateApproval(proposed, [{ ref: "bbbbbbbbbbbb", text: proposed[1].text }]);
  assert.ok(r.ok);
  assert.equal(r.approved.length, 1);
});

test("validation : rien de gardé, un avis inconnu, un doublon ou un texte hors bornes sont refusés", () => {
  const cases: [unknown, RegExp][] = [
    [[], /Garde au moins une réponse/],
    [undefined, /Garde au moins une réponse/],
    [[{ ref: "zzzzzzzzzzzz", text: proposed[0].text }], /ne correspondent plus/],
    [[{ ref: "aaaaaaaaaaaa", text: proposed[0].text }, { ref: "aaaaaaaaaaaa", text: proposed[0].text }], /deux fois/],
    [[{ ref: "aaaaaaaaaaaa", text: "Merci !" }], /trop courte/],
    [[{ ref: "aaaaaaaaaaaa", text: "Merci pour votre avis. ".repeat(40) }], /trop longue/],
    [[{ ref: "aaaaaaaaaaaa" }], /n'a pas pu être lue/],
    [["texte"], /n'a pas pu être lue/],
  ];
  for (const [sent, message] of cases) {
    const r = validateApproval(proposed, sent);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, message);
  }
});

test("validation : les caractères de contrôle disparaissent, les retours à la ligne restent", () => {
  const r = validateApproval(proposed, [{ ref: "aaaaaaaaaaaa", text: "Merci pour votre message.\u0000\r\nÀ bientôt chez nous, toute l'équipe.\u0007" }]);
  assert.ok(r.ok);
  assert.equal(r.approved[0].text, "Merci pour votre message.\nÀ bientôt chez nous, toute l'équipe.");
});

test("carte : les réponses se lisent dans le contenu de l'idée, une idée sans réponse n'en montre aucune", () => {
  const now = Date.parse("2026-11-10T09:00:00Z");
  const cards = replyCards({ replies: proposed }, now);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((c) => c.when), ["il y a 2 jours", "il y a 5 jours"]);
  assert.equal(cards[1].careful, true);
  assert.deepEqual(replyCards({}, now), []);
  assert.deepEqual(replyCards(null, now), []);
  assert.deepEqual(replyCards({ replies: [{ ref: 1 }, "x"] }, now), []);
});

test("carte : la date d'un avis se dit en jours, puis en date au-delà de deux semaines", () => {
  const now = Date.parse("2026-11-10T09:00:00Z");
  assert.equal(reviewWhen("2026-11-10", now), "aujourd'hui");
  assert.equal(reviewWhen("2026-11-09", now), "hier");
  assert.equal(reviewWhen("2026-11-03", now), "il y a 7 jours");
  assert.match(reviewWhen("2026-10-01", now), /1.? octobre/);
});

test("équipe : elle lit le texte VALIDÉ, joint à son avis, jamais le brouillon d'origine", () => {
  const content = {
    replies: proposed,
    approvedReplies: [{ ref: "bbbbbbbbbbbb", text: "Merci d'avoir pris le temps de nous écrire. Nous sommes désolés pour cette expérience.", edited: true }],
    skippedRefs: ["aaaaaaaaaaaa"],
  };
  const out = approvedForTeam(content);
  assert.equal(out.length, 1);
  assert.equal(out[0].ref, "bbbbbbbbbbbb");
  assert.match(out[0].text, /désolés/);
  assert.equal(out[0].edited, true);
  assert.equal(out[0].date, "2026-11-05");
  assert.match(out[0].excerpt, /Poulet/);
  // Tant que le gérant n'a rien validé, l'équipe n'a rien à publier.
  assert.deepEqual(approvedForTeam({ replies: proposed }), []);
  assert.deepEqual(approvedForTeam(null), []);
  assert.deepEqual(approvedForTeam({ replies: proposed, approvedReplies: [{ ref: "inconnue", text: "x" }] }), []);
});

test("carte : le bouton « Oui » dit combien de réponses partent", () => {
  assert.equal(repliesYesLabel(0), "Aucune réponse à publier");
  assert.equal(repliesYesLabel(1), "Oui, publier cette réponse");
  assert.equal(repliesYesLabel(3), "Oui, publier 3 réponses");
});
