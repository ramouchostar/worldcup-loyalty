import { test } from "node:test";
import assert from "node:assert/strict";
import { missionIcs } from "./missions-ics";

const NOW = new Date("2026-10-12T10:00:00Z");
const m = { id: "11111111-2222-3333-4444-555555555555", shoot_date: "2026-10-27", shoot_start: "09:30", brief: { contact: { name: "Karim", phone: "0470 12 34 56" }, roles: ["Cuisinier"], access: "Cour, rue Haute" } };

test("le créneau choisi donne le début ET la fin (heure de Bruxelles → UTC)", () => {
  const ics = missionIcs(m, { forWho: "restaurant", restaurantName: "Burger Palace", providerName: "Studio Croustille", now: NOW })!;
  assert.match(ics, /DTSTART:20261027T083000Z/);
  assert.match(ics, /DTEND:20261027T103000Z/); // 09:30 – 11:30
  assert.match(ics, /SUMMARY:Tournage avec Studio Croustille/);
});

test("le prestataire lit « chez le restaurant », avec contact, présents et accès", () => {
  const ics = missionIcs(m, { forWho: "provider", restaurantName: "Burger Palace", providerName: "Studio Croustille", now: NOW })!;
  assert.match(ics, /SUMMARY:Tournage chez Burger Palace/);
  const flat = ics.replace(/\r\n /g, "");
  assert.match(flat, /Contact sur place : Karim · 0470 12 34 56/);
  assert.match(flat, /Présents : cuisinier/);
  assert.ok(flat.includes(String.raw`Accès : Cour\, rue Haute`), "la virgule est échappée");
  assert.match(flat, /moins de 48 h est dû en entier/);
});

test("chaque partie a son identifiant d'événement (deux agendas, deux fichiers)", () => {
  const a = missionIcs(m, { forWho: "restaurant", restaurantName: "x", providerName: "y", now: NOW })!;
  const b = missionIcs(m, { forWho: "provider", restaurantName: "x", providerName: "y", now: NOW })!;
  assert.match(a, /UID:11111111-2222-3333-4444-555555555555-restaurant@/);
  assert.match(b, /UID:11111111-2222-3333-4444-555555555555-provider@/);
});

test("une alarme deux jours avant", () => {
  assert.match(missionIcs(m, { forWho: "restaurant", restaurantName: "x", providerName: "y", now: NOW })!, /TRIGGER:-P2D/);
});

test("sans date réservée, pas de fichier", () => {
  assert.equal(missionIcs({ ...m, shoot_date: null }, { forWho: "restaurant", restaurantName: "x", providerName: "y" }), null);
  assert.equal(missionIcs({ ...m, shoot_start: null }, { forWho: "restaurant", restaurantName: "x", providerName: "y" }), null);
});

test("un créneau inconnu retombe sur deux heures", () => {
  const ics = missionIcs({ ...m, shoot_start: "13:00" }, { forWho: "restaurant", restaurantName: "x", providerName: "y", now: NOW })!;
  assert.match(ics, /DTSTART:20261027T120000Z/);
  assert.match(ics, /DTEND:20261027T140000Z/);
});
