import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlaceOrderingInfo } from "../audit/places";
import { hoursEditorData, pageInfo, planInfoAction } from "./console-info";
import type { FicheRead } from "./fiche";
import type { Openness } from "./hours";
import { NO_SETTINGS, type PageSettings } from "./page-settings";

const NOON = new Date("2026-11-26T11:00:00Z");
const WEEK = Array.from({ length: 7 }, (_, i) => (i === 6 ? [] : [{ open: "11:00", close: "22:00" }]));
const CONTACT = { name: "Chez Exemple", phone: "+32 2 123 45 67", address: "Rue Inventée 12, 1090 Jette", cuisine: "Poulet frit" };
const info = (extra: Partial<PlaceOrderingInfo> = {}): PlaceOrderingInfo => ({
  rating: 4, reviewsCount: 12, businessStatus: "OPERATIONAL", currentOpeningHours: null,
  regularOpeningHours: { periods: [1, 2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 11 }, close: { day, hour: 22 } })) },
  attributions: [], phone: "02 123 45 67", address: "Rue Autre 3, 1000 Bruxelles, Belgique", ...extra,
});
const READ: FicheRead = { ok: true, info: info() };
const DOWN: FicheRead = { ok: false, cause: "lecture_impossible" };
const settings = (extra: Partial<PageSettings> = {}): PageSettings => ({ ...NO_SETTINGS, ...extra });

test("les badges disent d'où vient chaque information", () => {
  const v = pageInfo({ settings: settings(), contact: CONTACT, read: READ, now: NOON });
  assert.deepEqual(v.hours, { source: "google", lines: ["Lundi au samedi, 11:00 à 22:00", "Dimanche fermé"] });
  assert.equal(v.phone.source, "google"); // le même numéro, écrit autrement
  assert.equal(v.address.source, "toi");
  assert.equal(pageInfo({ settings: settings(), contact: { ...CONTACT, address: "rue autre 3 1000 Bruxelles" }, read: READ, now: NOON }).address.source, "google");
  assert.deepEqual(v.presentation, { value: null, shown: "Poulet frit, à emporter" });
});

test("fiche illisible : aucun badge inventé pour le téléphone et l'adresse", () => {
  const v = pageInfo({ settings: settings(), contact: CONTACT, read: DOWN, now: NOON });
  assert.deepEqual([v.phone.source, v.address.source, v.hours.source], [null, null, null]);
  assert.deepEqual(v.hours.lines, ["Google ne répond pas pour le moment."]);
  assert.deepEqual([v.state.openness.state, v.state.cause], ["inconnu", "lecture_impossible"]);
});

test("avec ses horaires ou en repli, la ligne dit « Toi »", () => {
  for (const [s, read] of [[settings({ source: "manual", weekly: WEEK }), READ], [settings({ weekly: WEEK }), DOWN]] as const) {
    assert.equal(pageInfo({ settings: s, contact: CONTACT, read, now: NOON }).hours.source, "toi");
  }
});

test("fermé pour aujourd'hui et jour spécial du jour", () => {
  assert.equal(pageInfo({ settings: settings({ closedToday: "2026-11-26" }), contact: CONTACT, read: READ, now: NOON }).closedToday, true);
  assert.equal(pageInfo({ settings: settings({ closedToday: "2026-11-25" }), contact: CONTACT, read: READ, now: NOON }).closedToday, false);
  const v = pageInfo({ settings: settings({ closures: [{ from: "2026-11-26", to: "2026-11-26" }] }), contact: CONTACT, read: READ, now: NOON });
  assert.equal(v.plannedClosure, "26 novembre : fermé");
  assert.equal(v.hours.source, "google"); // la semaine habituelle reste montrée
});

test("l'écran des horaires ne montre que les fermetures à venir", () => {
  const data = hoursEditorData(settings({ closures: [{ from: "2026-01-01", to: "2026-01-01" }, { from: "2026-12-25", to: "2026-12-25" }] }), NOON);
  assert.deepEqual(data.closures.map((c) => c.label), ["25 décembre : fermé"]);
  assert.equal(data.today, "2026-11-26");
});

const noRead = async (): Promise<Openness> => { throw new Error("la fiche ne devait pas être lue"); };

test("le téléphone et l'adresse s'écrivent dans l'établissement, même sans la migration ; le reste attend", async () => {
  const off = settings({ activated: false });
  assert.deepEqual(await planInfoAction({ action: "contact", field: "phone", value: "02 123 45 67" }, off, NOON, noRead), { ok: true, write: { kind: "restaurant", field: "phone", value: "02 123 45 67" } });
  for (const body of [{ action: "contact", field: "presentation", value: "x" }, { action: "close_today" }, { action: "hours", source: "google" }]) {
    const plan = await planInfoAction(body, off, NOON, noRead);
    assert.equal(!plan.ok && plan.status, 503, JSON.stringify(body));
  }
});

test("chaque geste écrit ses seules colonnes", async () => {
  const patch = async (body: unknown, s = settings()) => {
    const plan = await planInfoAction(body, s, NOON, noRead);
    return plan.ok && plan.write.kind === "reglages" ? plan.write.patch : plan;
  };
  assert.deepEqual(await patch({ action: "offers", offers: { terrace: true, dineIn: false, matchScreen: true } }), { offers_terrace: true, offers_dine_in: false, offers_match_screen: true });
  assert.deepEqual(await patch({ action: "hours", source: "manual", weekly: WEEK }), { hours_source: "manual", weekly_hours: WEEK });
  assert.deepEqual(await patch({ action: "add_closure", from: "2026-12-25" }), { closures: [{ from: "2026-12-25", to: "2026-12-25" }] });
  assert.deepEqual(await patch({ action: "remove_closure", from: "2026-12-25", to: "2026-12-25" }, settings({ closures: [{ from: "2026-12-25", to: "2026-12-25" }] })), { closures: [] });
  assert.deepEqual(await patch({ action: "close_today" }), { closed_today: "2026-11-26" }); // en journée, la fiche n'est pas lue
  assert.deepEqual(await patch({ action: "reopen_today" }), { closed_today: null });
  for (const bad of [null, {}, { action: "autre" }, { action: "offers" }, { action: "hours", source: "manual" }]) {
    assert.equal((await planInfoAction(bad, settings(), NOON, noRead)).ok, false, JSON.stringify(bad));
  }
});

test("fermer après minuit : le service en cours est celui de la veille", async () => {
  const night = new Date("2026-11-26T23:30:00Z"); // 00:30 le 27 à Bruxelles
  const open = await planInfoAction({ action: "close_today" }, settings(), night, async () => ({ state: "ouvert", closes: null }));
  assert.deepEqual(open.ok && open.write.kind === "reglages" && open.write.patch, { closed_today: "2026-11-26" });
  const shut = await planInfoAction({ action: "close_today" }, settings(), night, async () => ({ state: "ferme", opens: null }));
  assert.deepEqual(shut.ok && shut.write.kind === "reglages" && shut.write.patch, { closed_today: "2026-11-27" });
});
