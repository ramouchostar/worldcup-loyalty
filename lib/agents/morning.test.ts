import { test } from "node:test";
import assert from "node:assert/strict";
import { morningEmailOpen } from "./morning";
import { assistantNames, morningSubject, proIdeasEmail } from "../email-templates/pro-ideas";

test("le message du matin ne part qu'aux établissements ouverts", () => {
  assert.equal(morningEmailOpen("houba", ""), false);
  assert.equal(morningEmailOpen("houba", undefined), false);
  assert.equal(morningEmailOpen("houba", "houba, de-bue"), true);
  assert.equal(morningEmailOpen("kraainem", "houba,de-bue"), false);
  assert.equal(morningEmailOpen("kraainem", "*"), true);
});

test("l'objet dit qui propose et combien", () => {
  assert.equal(assistantNames([{ assistant: "hugo" }, { assistant: "emma" }, { assistant: "hugo" }]), "Hugo et Emma");
  assert.equal(morningSubject([{ assistant: "hugo" }, { assistant: "emma" }]), "Hugo et Emma ont 2 idées pour toi");
  assert.equal(morningSubject([{ assistant: "chloe" }]), "Chloé a 1 idée pour toi");
  assert.equal(morningSubject([{ assistant: "lea" }, { assistant: "lea" }]), "Léa a 2 idées pour toi");
  assert.equal(morningSubject([{ assistant: "lea" }, { assistant: "hugo" }, { assistant: "max" }]), "Léa, Hugo et Max ont 3 idées pour toi");
});

test("l'e-mail mène aux idées, échappe les titres et porte les portraits", () => {
  const e = proIdeasEmail({
    restaurantName: "Belchicken Houba",
    restaurantId: "houba",
    ideas: [{ assistant: "hugo", title: "23 clients <ne> reviennent plus", question: "Je leur écris ?" }],
  });
  assert.equal(e.subject, "Hugo a 1 idée pour toi");
  assert.match(e.html, /\/admin\/houba\/idees/);
  assert.match(e.html, /23 clients &lt;ne&gt; reviennent plus/);
  assert.match(e.html, /\/marketing\/brigade\/hugo\.jpg/);
  assert.match(e.text, /Voir mes idées : .*\/admin\/houba\/idees/);
  assert.doesNotMatch(e.text, /\bIA\b|robot|agent/);
});
