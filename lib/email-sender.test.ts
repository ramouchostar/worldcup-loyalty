import { test } from "node:test";
import assert from "node:assert/strict";
import { replyToAddress, restaurantCopyAddress, restaurantCopySubject, senderAddress, senderDisplayName } from "./email-sender";

test("expéditeur membre : le nom de l'établissement, sur le domaine d'envoi", () => {
  assert.equal(
    senderAddress("member", "Belchicken Kraainem", { domain: "mail.boosteats.be" }),
    '"Belchicken Kraainem" <bonjour@mail.boosteats.be>'
  );
});

test("expéditeur restaurateur : Boosteats", () => {
  assert.equal(senderAddress("restaurant", "Belchicken Kraainem", { domain: "mail.boosteats.be" }), "Boosteats <equipe@mail.boosteats.be>");
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
  assert.equal(replyToAddress({ replyTo: " contact@boosteats.be " }), "contact@boosteats.be");
  assert.equal(replyToAddress({ replyTo: "" }), undefined);
  assert.equal(replyToAddress({}), undefined);
});

test("copie plateforme : tout e-mail restaurateur, vers boosteats1@gmail.com par défaut", () => {
  assert.equal(restaurantCopyAddress("gerant@resto.be", "restaurant", "owner_invite", undefined), "boosteats1@gmail.com");
  assert.equal(restaurantCopyAddress("gerant@resto.be", "restaurant", "weekly_recap", " autre@boosteats.be "), "autre@boosteats.be");
});

test("copie plateforme : jamais un e-mail membre, ni le test, ni à soi-même, ni si désactivée", () => {
  assert.equal(restaurantCopyAddress("membre@gmail.com", "member", "welcome", undefined), null);
  assert.equal(restaurantCopyAddress("gerant@resto.be", "restaurant", "test", undefined), null);
  assert.equal(restaurantCopyAddress("Boosteats1@gmail.com", "restaurant", "owner_invite", undefined), null);
  assert.equal(restaurantCopyAddress("gerant@resto.be", "restaurant", "owner_invite", ""), null);
});

test("copie plateforme : l'objet dit à qui l'original est parti", () => {
  assert.equal(restaurantCopySubject("Ta semaine", "gerant@resto.be"), "[Copie → gerant@resto.be] Ta semaine");
});
