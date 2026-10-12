import { test } from "node:test";
import assert from "node:assert/strict";
import { dateLabelFr, teamMessage, whatsappShareUrl } from "./mission-team-message";

const base = {
  shootDate: "2026-10-20",
  startTime: "09:30",
  providerName: "Studio Croustille",
  roles: ["Cuisinier", "Serveur"],
  kitchen: "Non",
  contactName: "Karim",
  contactPhone: "0470 12 34 56",
};

test("date en français", () => {
  assert.equal(dateLabelFr("2026-10-20"), "mardi 20 octobre");
  assert.equal(dateLabelFr("2026-12-01"), "mardi 1 décembre");
});

test("le message dit quand, avec qui, qui doit être là et ce qui est attendu", () => {
  const m = teamMessage(base);
  assert.match(m, /Tournage le mardi 20 octobre à 09:30 avec Studio Croustille/);
  assert.match(m, /Qui doit être là : cuisinier, serveur\./);
  assert.match(m, /uniforme propre et repassé/);
  assert.match(m, /assiettes un peu plus remplies/);
  assert.match(m, /vaisselle propre/);
  assert.match(m, /Contact sur place : Karim · 0470 12 34 56/);
});

test("cuisine : « Non » écrit aucun plan en cuisine, « Oui » demande une cuisine rangée", () => {
  assert.match(teamMessage({ ...base, kitchen: "Non" }), /aucun plan en cuisine/);
  assert.match(teamMessage({ ...base, kitchen: "Oui" }), /cuisine propre et rangée : elle sera filmée/);
  assert.doesNotMatch(teamMessage({ ...base, kitchen: undefined }), /cuisine/);
});

test("rien ne manque en silence : un champ vide devient un crochet à compléter", () => {
  const m = teamMessage({ ...base, roles: [], contactName: "", contactPhone: undefined });
  assert.match(m, /Qui doit être là : \[à choisir\]/);
  assert.match(m, /Contact sur place : \[prénom\] · \[téléphone\]/);
});

test("jamais un euro dans le texte envoyé à l'équipe", () => {
  assert.doesNotMatch(teamMessage(base), /€|euro/i);
});

test("lien WhatsApp encodé", () => {
  const url = whatsappShareUrl("Salut l'équipe !\nTournage");
  assert.ok(url.startsWith("https://wa.me/?text="));
  assert.ok(!url.includes("\n"));
  assert.equal(decodeURIComponent(url.slice("https://wa.me/?text=".length)), "Salut l'équipe !\nTournage");
});
