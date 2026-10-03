import { test } from "node:test";
import assert from "node:assert/strict";
import { brusselsMonthStartIso, joinNames, needsNudge, nextMonth, previousMonth, sortStaff, staffBadgeWhatsappUrl, staffStatus, staffToNudge, topStaff, type StaffStatusInput } from "./staff-status";

const NOW = new Date("2026-10-03T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const p = (over: Partial<StaffStatusInput>): StaffStatusInput => ({
  label: "X",
  isActive: true,
  landings30d: 0,
  signups30d: 0,
  createdAt: daysAgo(20),
  ...over,
});

test("à relancer : plus de 7 jours, moins de 3 scans, aucune inscription", () => {
  assert.equal(needsNudge(p({ landings30d: 2 }), NOW), true);
  assert.equal(needsNudge(p({ landings30d: 3 }), NOW), false);
  // Créé il y a 3 jours : « Nouveau », jamais en défaut trop tôt
  assert.equal(needsNudge(p({ createdAt: daysAgo(3) }), NOW), false);
  // Peu d'arrivées comptées mais des inscrits : il fait le travail
  assert.equal(needsNudge(p({ landings30d: 1, signups30d: 2 }), NOW), false);
  assert.equal(needsNudge(p({ isActive: false }), NOW), false);
  assert.equal(needsNudge(p({ createdAt: null }), NOW), false);
});

test("états : meilleur, actif, nouveau, à relancer, désactivé", () => {
  const sofia = p({ label: "Sofia", landings30d: 31, signups30d: 9 });
  const mehdi = p({ label: "Mehdi", landings30d: 22, signups30d: 6 });
  const lina = p({ label: "Lina", landings30d: 6, signups30d: 2, createdAt: daysAgo(3) });
  const karim = p({ label: "Karim", landings30d: 2 });
  const ancien = p({ label: "Ancien", isActive: false, signups30d: 12 });
  const all = [sofia, mehdi, lina, karim, ancien];
  assert.deepEqual(all.map((s) => staffStatus(s, all, NOW)), ["top", "actif", "nouveau", "a_relancer", "desactive"]);
  // Un désactivé ne peut pas être le meilleur du mois
  assert.equal(topStaff(all), sofia);
  assert.equal(topStaff([karim]), null);
  assert.deepEqual(staffToNudge(all, NOW).map((s) => s.label), ["Karim"]);
});

test("tri : actifs par inscrits puis arrivées, désactivés en dernier", () => {
  const list = [
    p({ label: "B", signups30d: 1, landings30d: 5 }),
    p({ label: "Old", isActive: false, signups30d: 50 }),
    p({ label: "A", signups30d: 4 }),
    p({ label: "C", signups30d: 1, landings30d: 9 }),
  ];
  assert.deepEqual(sortStaff(list).map((s) => s.label), ["A", "C", "B", "Old"]);
});

test("prénoms en français", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["Karim"]), "Karim");
  assert.equal(joinNames(["Karim", "Inès"]), "Karim et Inès");
  assert.equal(joinNames(["Karim", "Inès", "Sami"]), "Karim, Inès et Sami");
});

test("WhatsApp : badge et phrase dans le message, aucun numéro imposé", () => {
  const url = staffBadgeWhatsappUrl("Karim", "Belchicken Kraainem", "https://www.boosteats.be/badge/ABC234");
  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  const text = decodeURIComponent(url.split("text=")[1]);
  assert.match(text, /Salut Karim/);
  assert.match(text, /https:\/\/www\.boosteats\.be\/badge\/ABC234/);
  assert.match(text, /photographiez votre ticket/);
});

test("bornes d'un mois à Bruxelles", () => {
  assert.equal(brusselsMonthStartIso(202609), "2026-08-31T22:00:00.000Z"); // été, UTC+2
  assert.equal(brusselsMonthStartIso(202612), "2026-11-30T23:00:00.000Z"); // hiver, UTC+1
  assert.equal(nextMonth(202612), 202701);
  assert.equal(previousMonth(202701), 202612);
});
