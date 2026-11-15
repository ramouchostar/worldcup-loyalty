import { test } from "node:test";
import assert from "node:assert/strict";
import { belgianSpecialDays, datesLabel, easterSunday, feteDecision, nextOccasion, type FeteInput } from "./max-fetes";
import { checkBar } from "./playbook";
import { ideaKey, planCovers, requiredPlan } from "./proposals";

const input = (over: Partial<FeteInput> = {}): FeteInput => ({
  restaurantId: "kraainem",
  todayISO: "2026-12-09",
  hasPlace: true,
  specialDaysOnFiche: null,
  readNote: "hors_fenetre",
  ficheManaged: false,
  ...over,
});

test("Pâques et les fêtes mobiles tombent aux bonnes dates", () => {
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
  const d2027 = belgianSpecialDays(2027).map((d) => `${d.date} ${d.label}`);
  assert.ok(d2027.includes("2027-03-29 lundi de Pâques"));
  assert.ok(d2027.includes("2027-05-06 Ascension"));
  assert.ok(d2027.includes("2027-05-17 lundi de Pentecôte"));
});

test("les fêtes de fin d'année forment une seule occasion, du 24 décembre au 1er janvier", () => {
  const occ = nextOccasion("2026-12-09");
  assert.deepEqual(occ?.map((d) => d.date), ["2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"]);
  assert.equal(datesLabel(occ!.map((d) => d.date)), "24, 25 et 31 décembre et 1er janvier");
});

test("fenêtre : de J-15 à J-2 avant le premier jour, pas en dehors", () => {
  assert.equal(nextOccasion("2026-12-08"), null, "J-16 : trop tôt");
  assert.ok(nextOccasion("2026-12-09"), "J-15");
  assert.ok(nextOccasion("2026-12-22"), "J-2");
  assert.equal(nextOccasion("2026-12-23"), null, "J-1 : trop tard pour poser les horaires");
  assert.equal(nextOccasion("2026-11-15"), null, "aujourd'hui : rien dans les 15 jours");
});

test("l'idée : une par occasion, ouverte jusqu'à J-2, traitée par l'équipe, et elle passe la barre", () => {
  const d = feteDecision(input());
  assert.equal(d.reason, null);
  const idea = d.idea!;
  assert.equal(idea.title, "Tes horaires du 24, 25 et 31 décembre et 1er janvier sont-ils sur ta fiche Google ?");
  assert.equal(idea.decideBy, "2026-12-22");
  assert.equal(idea.action.via, "equipe");
  assert.match(idea.lines.who, /Déjà fait/);
  assert.equal(ideaKey(idea), "max:horaires_jours_speciaux:horaires_fetes:2026-12-24");
  assert.equal(checkBar(idea).ok, true);
  assert.doesNotMatch(JSON.stringify(idea.lines), /€ de|IA|robot/);
});

test("dans les 7 jours : se tait si tous les jours sont déjà sur la fiche, jamais sur une lecture en échec", () => {
  // Armistice 2027 (jeudi 11/11), lu le 6/11 : un seul jour, dans la fenêtre Places.
  const today = "2027-11-06";
  assert.equal(feteDecision(input({ todayISO: today, specialDaysOnFiche: ["2027-11-11"], readNote: "lu" })).reason, "deja_sur_la_fiche");
  assert.ok(feteDecision(input({ todayISO: today, specialDaysOnFiche: [], readNote: "lu" })).idea);
  assert.ok(feteDecision(input({ todayISO: today, specialDaysOnFiche: null, readNote: "echec" })).idea);
});

test("les fêtes de fin d'année ne se taisent pas sur une lecture partielle (le 1er janvier hors fenêtre)", () => {
  const d = feteDecision(input({ todayISO: "2026-12-20", specialDaysOnFiche: ["2026-12-24", "2026-12-25"], readNote: "lu" }));
  assert.ok(d.idea, "31/12 et 1/1 ne sont pas encore lisibles : Max demande");
});

test("sans fiche Google, rien", () => {
  assert.equal(feteDecision(input({ hasPlace: false })).reason, "pas_de_fiche");
});

test("forfait : dès Croissance (Houba, De Bue), pas en Gratuit", () => {
  const idea = feteDecision(input()).idea!;
  assert.equal(requiredPlan(idea), "croissance");
  assert.equal(planCovers("croissance", requiredPlan(idea)), true);
  assert.equal(planCovers("gratuit", requiredPlan(idea)), false);
});
