import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyArrival, classifyDevice, isArrivalSource } from "./arrival-source";

const OWN = ["boosteats.com"];
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

test("un QR imprimé reste « qr_code », même avec un navigateur ordinaire", () => {
  assert.equal(classifyArrival({ utmSource: "qr_code", userAgent: PHONE }), "qr_code");
});

test("l'aperçu de lien de WhatsApp et les robots sont séparés du « direct »", () => {
  assert.equal(classifyArrival({ userAgent: "WhatsApp/2.23.20.0 A" }), "apercu_lien");
  assert.equal(classifyArrival({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" }), "apercu_lien");
  assert.equal(classifyArrival({ userAgent: "facebookexternalhit/1.1" }), "apercu_lien");
  assert.equal(classifyArrival({ userAgent: "Slackbot-LinkExpanding 1.0" }), "apercu_lien");
});

test("un téléphone ordinaire sans origine est « direct »", () => {
  assert.equal(classifyArrival({ userAgent: PHONE }), "direct");
  assert.equal(classifyArrival({}), "direct");
});

test("l'origine est classée : réseau social, recherche, autre site, nous-mêmes", () => {
  assert.equal(classifyArrival({ userAgent: PHONE, referer: "https://l.instagram.com/?u=x" }), "reseau_social");
  assert.equal(classifyArrival({ userAgent: PHONE, referer: "https://www.facebook.com/" }), "reseau_social");
  assert.equal(classifyArrival({ userAgent: PHONE, referer: "https://www.google.com/" }), "recherche");
  assert.equal(classifyArrival({ userAgent: PHONE, referer: "https://www.google.be/search?q=x" }), "recherche");
  assert.equal(classifyArrival({ userAgent: PHONE, referer: "https://blog.exemple.be/article" }), "autre_site");
  assert.equal(classifyArrival({ userAgent: PHONE, referer: "https://app.boosteats.com/x", ownHosts: OWN }), "boosteats");
});

test("un utm que nous n'avons pas prévu est « utm_autre »", () => {
  assert.equal(classifyArrival({ utmSource: "flyer", userAgent: PHONE }), "utm_autre");
});

test("un referer illisible ne casse rien", () => {
  assert.equal(classifyArrival({ userAgent: PHONE, referer: "pas une url" }), "direct");
});

test("le referer brut n'est jamais rendu : seule une valeur de la liste close sort", () => {
  const v = classifyArrival({ userAgent: PHONE, referer: "https://secret.example.com/?token=abc" });
  assert.equal(isArrivalSource(v), true);
  assert.equal(v.includes("secret"), false);
});

test("la famille de téléphone est déduite de l'agent, sans le conserver (ADR 0096)", () => {
  assert.equal(classifyDevice(PHONE), "ios");
  assert.equal(classifyDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"), "android");
  assert.equal(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"), "autre");
  assert.equal(classifyDevice(null), "autre");
  assert.equal(classifyDevice(undefined), "autre");
});
