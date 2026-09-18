import { test } from "node:test";
import assert from "node:assert/strict";
import { replyToAddress, senderAddress, senderDisplayName } from "./email-sender";

test("expéditeur membre : le nom de l'établissement, sur le domaine d'envoi", () => {
  assert.equal(
    senderAddress("member", "Belchicken Kraainem", { domain: "mail.boosteats.tech" }),
    '"Belchicken Kraainem" <bonjour@mail.boosteats.tech>'
  );
});

test("expéditeur restaurateur : Boosteats", () => {
  assert.equal(senderAddress("restaurant", "Belchicken Kraainem", { domain: "mail.boosteats.tech" }), "Boosteats <equipe@mail.boosteats.tech>");
});

test("sans domaine configuré : repli sur EMAIL_FROM, puis sur l'adresse de test Resend", () => {
  assert.equal(senderAddress("member", "X", { domain: "", fallbackFrom: "Boosteats <a@b.c>" }), "Boosteats <a@b.c>");
  assert.equal(senderAddress("member", "X", {}), "Boosteats <onboarding@resend.dev>");
});

test("nom affiché : ni guillemets, ni chevrons, ni retour à la ligne", () => {
  assert.equal(senderDisplayName('Chez "Momo" <3\r\nBcc: x@y.z'), "Chez Momo 3 Bcc: x@y.z");
  assert.equal(senderDisplayName("   "), "Boosteats");
  assert.equal(senderDisplayName("a".repeat(80)).length, 60);
});

test("réponses : l'adresse configurée, jamais une chaîne vide", () => {
  assert.equal(replyToAddress({ replyTo: " contact@boosteats.tech " }), "contact@boosteats.tech");
  assert.equal(replyToAddress({ replyTo: "" }), undefined);
  assert.equal(replyToAddress({}), undefined);
});
