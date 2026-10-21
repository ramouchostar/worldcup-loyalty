import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PROFILE, isProfileEmpty, profileIssueText, sanitizeProfile, validateProfile, type ProviderProfile } from "./provider-profile";

const ok: ProviderProfile = {
  bio: "Vidéaste à Bruxelles depuis 8 ans, spécialisé restauration.",
  does: ["Tournage", "Montage", "Reels"],
  doesNot: ["Drone", "Voix off"],
  equipment: "Sony FX3, stabilisateur, lumière portable",
  zone: "Bruxelles et Brabant",
  languages: ["Français", "Anglais"],
  works: [{ label: "Reel brasserie", url: "https://vimeo.com/123456" }],
};
const first = (p: ProviderProfile) => validateProfile(p).issues[0];

test("un profil complet et un profil vide sont acceptés", () => {
  assert.deepEqual(validateProfile(ok), { ok: true, issues: [] });
  assert.equal(validateProfile(EMPTY_PROFILE).ok, true);
});

test("aucun numéro, e-mail ni lien de messagerie dans les textes", () => {
  assert.deepEqual({ field: first({ ...ok, bio: "Écris-moi : moi@exemple.be" }).field, code: first({ ...ok, bio: "Écris-moi : moi@exemple.be" }).code }, { field: "bio", code: "contact_in_text" });
  assert.equal(first({ ...ok, equipment: "Appelle le 0470 12 34 56" }).code, "contact_in_text");
  const tag = first({ ...ok, does: ["Whatsapp wa.me/32470123456"] });
  assert.equal(tag.field, "does");
  assert.equal(tag.code, "contact_in_text");
  assert.equal(tag.index, 0);
});

test("un texte trop long est refusé", () => {
  assert.equal(first({ ...ok, bio: "a".repeat(501) }).code, "too_long");
});

test("une chose ne peut pas être faite et refusée à la fois", () => {
  const i = first({ ...ok, does: ["Drone"], doesNot: ["drone"] });
  assert.equal(i.field, "doesNot");
  assert.equal(i.code, "duplicate");
});

test("trop d'étiquettes, étiquette trop longue, langue inconnue", () => {
  assert.equal(first({ ...ok, does: Array.from({ length: 13 }, (_, i) => `Chose ${i}`) }).code, "too_many");
  assert.equal(first({ ...ok, does: ["x".repeat(41)] }).code, "tag_too_long");
  assert.equal(first({ ...ok, languages: ["Klingon"] }).code, "language_unknown");
});

test("exemples de travaux : https, un nom, pas de messagerie, huit au plus", () => {
  const http = first({ ...ok, works: [{ label: "Reel", url: "http://vimeo.com/1" }] });
  assert.equal(http.code, "work_url");
  assert.equal(http.url, "not_https");
  assert.equal(first({ ...ok, works: [{ label: "R", url: "https://vimeo.com/1" }] }).code, "work_label");
  assert.equal(first({ ...ok, works: [{ label: "Mon contact", url: "https://wa.me/32470123456" }] }).code, "work_url");
  assert.equal(first({ ...ok, works: Array.from({ length: 9 }, (_, i) => ({ label: `Travail ${i}`, url: "https://vimeo.com/1" })) }).code, "too_many");
});

test("chaque refus a un texte lisible", () => {
  const p = { ...ok, bio: "moi@exemple.be", works: [{ label: "Reel", url: "ftp://x" }] };
  for (const i of validateProfile(p).issues) assert.ok(profileIssueText(i).length > 5);
});

test("sanitizeProfile : ne plante sur aucune entrée", () => {
  for (const raw of [null, undefined, 3, "x", [], { does: "x", works: [null, 3, {}] }]) assert.doesNotThrow(() => sanitizeProfile(raw));
});

test("sanitizeProfile : espaces, doublons et vide nettoyés", () => {
  const p = sanitizeProfile({ ...ok, does: ["  Tournage  ", "Tournage", "", "Montage"], bio: "  a   b  " });
  assert.deepEqual(p.does, ["Tournage", "Montage"]);
  assert.equal(p.bio, "a b");
});

test("sanitizeProfile : un dépassement reste visible pour que la validation le refuse", () => {
  assert.equal(validateProfile(sanitizeProfile({ ...ok, bio: "a".repeat(900) })).ok, false);
});

test("isProfileEmpty : vide ou absent n'affiche rien", () => {
  assert.equal(isProfileEmpty(null), true);
  assert.equal(isProfileEmpty(EMPTY_PROFILE), true);
  assert.equal(isProfileEmpty({ ...EMPTY_PROFILE, zone: "Bruxelles" }), false);
});
